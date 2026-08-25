import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureDemoEventSchemaRegistered,
  ensureUserForFirebaseSession,
  getDemoFunnelForProject,
  ProjectNotFoundError,
  RawRecordModel,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-92's `ensureDemoEventSchemaRegistered`/
 * `getDemoFunnelForProject`. Raw records are landed directly via
 * `RawRecordModel` — same "bypass the full ingest pipeline, control
 * `landed_at` precisely" posture `support.emulator.test.ts` (KAN-90)
 * establishes.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('sales-service-tests');
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

async function landDemoEvent(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  demoId: string;
  stage: 'scheduled' | 'held' | 'no_show' | 'canceled';
  repOrgPersonId?: string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = 'demo_event';
  record.client_id = unique('client');
  const properties: Record<string, unknown> = { demo_id: params.demoId, stage: params.stage };
  if (params.repOrgPersonId !== undefined) properties.rep_org_person_id = params.repOrgPersonId;
  record.payload = { event: 'demo_event', event_id: unique('event'), ts: params.landedAt, properties };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('ensureDemoEventSchemaRegistered', () => {
  it('registers the demo_event event schema with the right fields', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Sales Schema Org');
    const result = await ensureDemoEventSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.field_defs.map((field) => field.name)).toEqual(['demo_id', 'stage', 'rep_org_person_id', 'account_name']);
  });

  it('is idempotent: a second call is a no-op and reports registered: false', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Sales Schema Idempotent Org');
    await ensureDemoEventSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    const second = await ensureDemoEventSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    expect(second.registered).toBe(false);
  });
});

describe('getDemoFunnelForProject', () => {
  it('computes the funnel and per-rep breakdown from landed demo events', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Sales Funnel Org');
    await ensureDemoEventSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });

    await landDemoEvent({ organizationId: organization.id, projectId: project.id, environmentId, demoId: 'd1', stage: 'scheduled', repOrgPersonId: 'rep_1', landedAt: '2026-09-01T08:00:00.000Z' });
    await landDemoEvent({ organizationId: organization.id, projectId: project.id, environmentId, demoId: 'd1', stage: 'held', repOrgPersonId: 'rep_1', landedAt: '2026-09-01T09:00:00.000Z' });
    await landDemoEvent({ organizationId: organization.id, projectId: project.id, environmentId, demoId: 'd2', stage: 'scheduled', repOrgPersonId: 'rep_1', landedAt: '2026-09-01T10:00:00.000Z' });

    const result = await getDemoFunnelForProject(organization.id, project.id);

    expect(result.demosScheduled).toBe(2);
    expect(result.demosHeld).toBe(1);
    expect(result.demosNoShow).toBe(0);
    expect(result.showRate).toBe(1);
    expect(result.rows).toEqual([{ repOrgPersonId: 'rep_1', demosHeld: 1, demosNoShow: 0, showRate: 1 }]);
  });

  it('uses precomputedRecords instead of fetching, when provided', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Sales Funnel Precomputed Org');
    await ensureDemoEventSchemaRegistered({ organizationId: organization.id, projectId: project.id, createdByUserId: owner.id });
    // Landed for real, but deliberately NOT what precomputedRecords below carries — proves the
    // precomputed path is actually used instead of re-fetching from Firestore.
    await landDemoEvent({ organizationId: organization.id, projectId: project.id, environmentId, demoId: 'real', stage: 'scheduled', landedAt: '2026-09-01T08:00:00.000Z' });

    const precomputed = new RawRecordModel();
    precomputed.organization_id = organization.id;
    precomputed.project_id = project.id;
    precomputed.environment_id = environmentId;
    precomputed.partition_date = '2026-09-02';
    precomputed.batch_id = unique('batch');
    precomputed.kind = 'event';
    precomputed.schema_name = 'demo_event';
    precomputed.client_id = unique('client');
    precomputed.payload = { event: 'demo_event', event_id: unique('event'), ts: '2026-09-02T08:00:00.000Z', properties: { demo_id: 'precomputed', stage: 'scheduled' } };
    precomputed.landed_at = '2026-09-02T08:00:00.000Z';

    const result = await getDemoFunnelForProject(organization.id, project.id, { precomputedRecords: [precomputed] });
    expect(result.demosScheduled).toBe(1);
  });

  it('throws ProjectNotFoundError for a project id that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Sales Funnel Wrong Org');
    await expect(getDemoFunnelForProject(organization.id, unique('nonexistent-project'))).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
