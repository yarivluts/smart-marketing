import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureCancellationReasonSchemaRegistered,
  ensureChurnReasonPackRegistered,
  ensureUserForFirebaseSession,
  getCancellationReasonCodeBreakdownForProject,
  getCancellationReasonDimensionBreakdownForProject,
  getCancellationReasonThemeDigestForProject,
  ProjectNotFoundError,
  RawRecordModel,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-84's `ensureCancellationReasonSchemaRegistered`/
 * `getCancellationReasonCodeBreakdownForProject`/`getCancellationReasonThemeDigestForProject`.
 * Raw records are landed directly via `RawRecordModel`, same posture
 * `feedback.emulator.test.ts` (KAN-82) established for its own reads.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('churn-reason-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const devEnvironment = environments.find((environment) => environment.name === 'dev')!;
  return { owner, organization, project, environmentId: devEnvironment.id };
}

async function landCancellationReason(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  reasonCode?: string;
  comment?: string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'cancellation_reason';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = {};
  if (params.reasonCode !== undefined) properties.reason_code = params.reasonCode;
  if (params.comment !== undefined) properties.comment = params.comment;
  record.payload = { event: 'cancellation_reason', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('ensureCancellationReasonSchemaRegistered', () => {
  it('registers the cancellation_reason event schema with the right fields', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cancellation Schema Org');
    const result = await ensureCancellationReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.field_defs.map((field) => field.name)).toEqual(['reason_code', 'comment']);
    // Not flagged PII (see CANCELLATION_REASON_SCHEMA_FIELDS's own doc comment): the theme digest's
    // whole point is surfacing this free text, matching billing-ops-view.ts's own free-text fields.
    expect(result.schemaDef.field_defs.find((field) => field.name === 'comment')?.is_pii).toBe(false);
  });

  it('is idempotent: a second call is a no-op and reports registered: false', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cancellation Schema Idempotent Org');
    await ensureCancellationReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const second = await ensureCancellationReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    expect(second.registered).toBe(false);
  });
});

describe('getCancellationReasonCodeBreakdownForProject', () => {
  it('counts each landed reason code, ignoring malformed records', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Reason Breakdown Org');
    await ensureCancellationReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'too_expensive', landedAt: '2026-06-01T09:00:00.000Z' });
    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'too_expensive', landedAt: '2026-06-02T09:00:00.000Z' });
    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'poor_support', landedAt: '2026-06-03T09:00:00.000Z' });
    // Malformed: no reason_code at all -- must be ignored, not crash the read.
    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-06-04T09:00:00.000Z' });

    const breakdown = await getCancellationReasonCodeBreakdownForProject(organization.id, project.id);

    expect(breakdown).toEqual([
      { reasonCode: 'too_expensive', count: 2 },
      { reasonCode: 'poor_support', count: 1 },
    ]);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Reason Breakdown Wrong Org');
    await expect(getCancellationReasonCodeBreakdownForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe('getCancellationReasonThemeDigestForProject', () => {
  it('clusters landed comments into themes within the window, most common first', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Cancellation Digest Org');
    await ensureCancellationReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-10T12:00:00.000Z');

    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'too_expensive', comment: 'Way too expensive for what we get', landedAt: '2026-06-01T09:00:00.000Z' });
    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'too_expensive', comment: 'Pricing is too high for our team size', landedAt: '2026-06-02T09:00:00.000Z' });
    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'poor_support', comment: 'Support takes forever to respond', landedAt: '2026-06-03T09:00:00.000Z' });
    // No comment at all -- must not crash or appear in the digest.
    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'other', landedAt: '2026-06-04T09:00:00.000Z' });

    const digest = await getCancellationReasonThemeDigestForProject(organization.id, project.id, { now, windowDays: 30 });

    expect(digest[0]).toMatchObject({ theme: 'pricing', commentCount: 2 });
    expect(digest[1]).toMatchObject({ theme: 'support', commentCount: 1 });
  });

  it('excludes comments landed outside the window', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Cancellation Digest Window Org');
    await ensureCancellationReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    const now = Date.parse('2026-06-30T12:00:00.000Z');

    await landCancellationReason({ organizationId: organization.id, projectId: project.id, environmentId, reasonCode: 'technical_issues', comment: 'The app crashes constantly, so many bugs', landedAt: '2026-01-01T09:00:00.000Z' });

    const digest = await getCancellationReasonThemeDigestForProject(organization.id, project.id, { now, windowDays: 30 });
    expect(digest).toEqual([]);
  });
});

describe('getCancellationReasonDimensionBreakdownForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dimension Breakdown Org');
    await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getCancellationReasonDimensionBreakdownForProject(organization.id, project.id, 'plan_interval');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when cancellations_total is not registered yet', async () => {
    const { organization, project } = await setupOrgWithProject('Dimension Breakdown Unregistered Org');

    const outcome = await getCancellationReasonDimensionBreakdownForProject(organization.id, project.id, 'channel_id');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });
});
