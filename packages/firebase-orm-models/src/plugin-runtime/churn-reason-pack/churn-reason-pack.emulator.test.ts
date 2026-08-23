import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  getActiveSchemaDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
  type MetricDefModel,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureChurnReasonPackRegistered } from './index';

/** Emulator-backed tests for KAN-84's Churn Reason pack — mirrors `feedback-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('churn-reason-pack-tests');
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
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

describe('ensureChurnReasonPackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Churn Reason Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureChurnReasonPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the cancellation_reason event schema', async () => {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'cancellation_reason');
    expect(schemaDef).not.toBeNull();
    expect(schemaDef?.field_defs.map((field) => field.name)).toEqual(['reason_code', 'comment']);
  });

  it('registers cancellations_total as active v1, breaking down by reason/plan/channel/cohort', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(1);
    expect(defs[0].version).toBe(1);
    expect(defs[0].status).toBe('active');

    const metric = await activeMetric('cancellations_total');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count',
      table: 'fact_cancellation_reason',
      timeColumn: 'ts',
      filters: [],
    });
    expect(metric?.dimensions).toEqual(['reason_code', 'plan_interval', 'channel_id', 'cohort_month']);
  });
});

describe('ensureChurnReasonPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'cancellations_total',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_churn_export', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['cancellations_total']);
    expect(result.registered).toEqual([]);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual(['cancellations_total']);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(1);
    expect(defs[0].version).toBe(1);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'cancellations_total');
    expect(metricInOtherProject).toBeNull();
    const schemaInOtherProject = await getActiveSchemaDefinition(organization.id, otherProject.id, 'event', 'cancellation_reason');
    expect(schemaInOtherProject).toBeNull();
  });
});
