import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureChurnReasonSchemaRegistered,
  ensureUserForFirebaseSession,
  getChurnReasonCategoryBreakdownForProject,
  getChurnReasonThemeDigestForProject,
  ProjectNotFoundError,
  RawRecordModel,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-84's `ensureChurnReasonSchemaRegistered`/
 * `getChurnReasonCategoryBreakdownForProject`/`getChurnReasonThemeDigestForProject`.
 * Raw records are landed directly via `RawRecordModel` — the same "bypass
 * the full ingest pipeline, control fields precisely" posture
 * `feedback.emulator.test.ts` (KAN-82) already established for its own
 * reads. Every fixture record's declared fields live under
 * `payload.properties` (the real shape a landed event carries) — never
 * `payload[fieldName]` directly, the bug an earlier record-feed pass caught
 * and fixed.
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

async function landChurnReason(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  category?: string;
  reasonText?: string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'churn_reason';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = {};
  if (params.category !== undefined) properties.category = params.category;
  if (params.reasonText !== undefined) properties.reason_text = params.reasonText;
  record.payload = { event: 'churn_reason', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('ensureChurnReasonSchemaRegistered', () => {
  it('registers the churn_reason event schema with the right fields', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Churn Reason Schema Org');
    const result = await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.field_defs.map((field) => field.name)).toEqual(['category', 'reason_text']);
    // Not flagged PII (see CHURN_REASON_SCHEMA_FIELDS's own doc comment): the theme digest's whole
    // point is surfacing this free text, matching survey_response's own `comment` field precedent.
    expect(result.schemaDef.field_defs.find((field) => field.name === 'reason_text')?.is_pii).toBe(false);
  });

  it('is idempotent: a second call is a no-op and reports registered: false', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Churn Reason Schema Idempotent Org');
    await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const second = await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    expect(second.registered).toBe(false);
  });
});

describe('getChurnReasonCategoryBreakdownForProject', () => {
  it('counts landed reasons by their exact structured category, most common first, ignoring malformed ones', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Churn Breakdown Org');
    await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'too_expensive', landedAt: '2026-06-01T09:00:00.000Z' });
    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'too_expensive', landedAt: '2026-06-02T09:00:00.000Z' });
    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'poor_support', landedAt: '2026-06-03T09:00:00.000Z' });
    // Malformed: no category at all -- must be ignored, not crash the read.
    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, landedAt: '2026-06-04T09:00:00.000Z' });

    const overview = await getChurnReasonCategoryBreakdownForProject(organization.id, project.id);

    expect(overview.totalReasons).toBe(3);
    expect(overview.byCategory).toEqual([
      { category: 'too_expensive', count: 2 },
      { category: 'poor_support', count: 1 },
    ]);
  });

  it('uses precomputedRecords instead of fetching, when provided', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Churn Breakdown Precomputed Org');
    await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    // Landed for real, but deliberately NOT what precomputedRecords below carries -- proves the
    // precomputed path is actually used instead of re-fetching from Firestore.
    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'poor_support', landedAt: '2026-06-01T09:00:00.000Z' });

    const precomputed = new RawRecordModel();
    precomputed.organization_id = organization.id;
    precomputed.project_id = project.id;
    precomputed.environment_id = environmentId;
    precomputed.partition_date = '2026-06-05';
    precomputed.batch_id = unique('batch');
    precomputed.kind = 'event';
    precomputed.schema_name = 'churn_reason';
    precomputed.client_id = unique('client');
    precomputed.payload = { event: 'churn_reason', event_id: unique('event'), ts: '2026-06-05T09:00:00.000Z', properties: { category: 'too_expensive' } };
    precomputed.landed_at = '2026-06-05T09:00:00.000Z';

    const overview = await getChurnReasonCategoryBreakdownForProject(organization.id, project.id, { precomputedRecords: [precomputed] });
    expect(overview.totalReasons).toBe(1);
    expect(overview.byCategory).toEqual([{ category: 'too_expensive', count: 1 }]);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Churn Breakdown Wrong Org');
    await expect(getChurnReasonCategoryBreakdownForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe('getChurnReasonThemeDigestForProject', () => {
  it('trusts a recognized structured category outright, regardless of free text', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Churn Digest Trust Org');
    await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landChurnReason({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      category: 'poor_support',
      reasonText: 'honestly it was just too expensive for us',
      landedAt: '2026-06-01T09:00:00.000Z',
    });

    const digest = await getChurnReasonThemeDigestForProject(organization.id, project.id);
    expect(digest).toEqual([{ theme: 'poor_support', reasonCount: 1, exampleReasons: ['honestly it was just too expensive for us'] }]);
  });

  it('infers a theme from free text for an other/unrecognized category, most common first', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Churn Digest Infer Org');
    await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'other', reasonText: 'it got too expensive for our budget', landedAt: '2026-06-01T09:00:00.000Z' });
    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'other', reasonText: 'the pricing was not affordable anymore', landedAt: '2026-06-02T09:00:00.000Z' });
    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'other', reasonText: 'support never responded to our tickets', landedAt: '2026-06-03T09:00:00.000Z' });

    const digest = await getChurnReasonThemeDigestForProject(organization.id, project.id);
    expect(digest[0]).toMatchObject({ theme: 'too_expensive', reasonCount: 2 });
    expect(digest[1]).toMatchObject({ theme: 'poor_support', reasonCount: 1 });
  });

  it('never drops a landed reason -- an other category with no matching keywords still counts as other', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Churn Digest No Drop Org');
    await ensureChurnReasonSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landChurnReason({ organizationId: organization.id, projectId: project.id, environmentId, category: 'other', reasonText: 'not applicable', landedAt: '2026-06-01T09:00:00.000Z' });

    const digest = await getChurnReasonThemeDigestForProject(organization.id, project.id);
    expect(digest).toEqual([{ theme: 'other', reasonCount: 1, exampleReasons: ['not applicable'] }]);
  });
});
