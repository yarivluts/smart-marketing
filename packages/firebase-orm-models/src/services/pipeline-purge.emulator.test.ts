import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createWinRule,
  ensureUserForFirebaseSession,
  enqueueAcceptedRecordsForPipeline,
  FirestoreWarehouseSink,
  landPipelineMessages,
  listAuditLogEntriesForOrg,
  listMetricDefinitionsForProject,
  listRawRecordsForBatch,
  listWinRulesForProject,
  ProjectNotFoundError,
  registerSchemaDefinition,
  listSchemaDefinitionsForProject,
  purgeProjectLandedData,
  PURGEABLE_LANDED_DATA_COLLECTIONS,
  registerMetricDefinition,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for the EasySign-audit J-04 purge: landed data goes, configuration stays. */

beforeAll(async () => {
  await connectToFirestoreEmulator('pipeline-purge-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupProjectWithLandedData(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'EasySign Growth' });
  const dev = environments.find((environment) => environment.name === 'dev')!;
  const prod = environments.find((environment) => environment.name === 'prod')!;

  for (const [environment, count] of [
    [dev, 2],
    [prod, 1],
  ] as const) {
    const messages = await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: Array.from({ length: count }, (_unused, index) => ({
        clientId: `${environment.name}-evt-${index}`,
        schemaName: 'trial_started',
        payload: { event: 'trial_started', event_id: `${environment.name}-evt-${index}` },
      })),
    });
    await landPipelineMessages(messages, { sink: new FirestoreWarehouseSink() });
  }

  // Configuration that must survive the purge.
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'trial_started',
    fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'lp_conversions',
    definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_landing_page_performance', column: 'conversions', timeColumn: 'activity_date', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  await createWinRule({
    organizationId: organization.id,
    projectId: project.id,
    name: 'New trial started',
    schemaName: 'trial_started',
    filters: [],
    winType: 'generic',
    createdByUserId: owner.id,
  });

  return { owner, organization, project, dev, prod };
}

describe('purgeProjectLandedData', () => {
  it('clears every landed-data collection across environments while leaving configuration untouched, and audits the purge', async () => {
    const { owner, organization, project } = await setupProjectWithLandedData('Purge All Org');

    const deleted = await purgeProjectLandedData({ organizationId: organization.id, projectId: project.id, performedByUserId: owner.id });

    expect(Object.keys(deleted).sort()).toEqual([...PURGEABLE_LANDED_DATA_COLLECTIONS].sort());
    expect(deleted.raw_records).toBe(3);
    expect(deleted.pipeline_messages).toBe(3);
    expect(deleted.ingest_batches).toBe(0);

    // Configuration survives.
    expect((await listMetricDefinitionsForProject(organization.id, project.id)).map((def) => def.name)).toEqual(['lp_conversions']);
    expect(await listWinRulesForProject(organization.id, project.id)).toHaveLength(1);
    expect((await listSchemaDefinitionsForProject(organization.id, project.id)).map((schema) => schema.name)).toEqual(['trial_started']);

    const audit = await listAuditLogEntriesForOrg(organization.id);
    const entry = audit.find((candidate) => candidate.action === 'project.purge_landed_data');
    expect(entry?.summary).toContain('across every environment');
  });

  it('scopes to one environment when asked, leaving the other environment\'s records in place', async () => {
    const { owner, organization, project, dev, prod } = await setupProjectWithLandedData('Purge One Env Org');

    const deleted = await purgeProjectLandedData({ organizationId: organization.id, projectId: project.id, environmentId: prod.id, performedByUserId: owner.id });
    expect(deleted.raw_records).toBe(1);

    // The dev records are still there; a second, dev-scoped purge finds exactly them.
    const devDeleted = await purgeProjectLandedData({ organizationId: organization.id, projectId: project.id, environmentId: dev.id, performedByUserId: owner.id });
    expect(devDeleted.raw_records).toBe(2);
  });

  it('is idempotent, and refuses a project that is not in this org', async () => {
    const { owner, organization, project } = await setupProjectWithLandedData('Purge Idempotent Org');
    await purgeProjectLandedData({ organizationId: organization.id, projectId: project.id, performedByUserId: owner.id });
    const second = await purgeProjectLandedData({ organizationId: organization.id, projectId: project.id, performedByUserId: owner.id });
    expect(Object.values(second).every((count) => count === 0)).toBe(true);

    await expect(purgeProjectLandedData({ organizationId: organization.id, projectId: 'does-not-exist', performedByUserId: owner.id })).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('leaves a sibling project in the same org completely alone', async () => {
    const { owner, organization, project } = await setupProjectWithLandedData('Purge Isolation Org');
    const { project: sibling, environments } = await createProject({ organizationId: organization.id, name: 'Sibling' });
    const siblingProd = environments.find((environment) => environment.name === 'prod')!;
    const batchId = unique('batch');
    const messages = await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: sibling.id,
      environmentId: siblingProd.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'sibling-evt', schemaName: 'trial_started', payload: { event: 'trial_started', event_id: 'sibling-evt' } }],
    });
    await landPipelineMessages(messages, { sink: new FirestoreWarehouseSink() });

    await purgeProjectLandedData({ organizationId: organization.id, projectId: project.id, performedByUserId: owner.id });

    expect(await listRawRecordsForBatch(organization.id, sibling.id, batchId)).toHaveLength(1);
  });
});
