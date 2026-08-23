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
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureChurnReasonPackRegistered } from './index';

/** Emulator-backed tests for KAN-84's Churn Reasons pack — mirrors `feedback-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

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
    const { owner, organization, project } = await setupOrgWithProject('Churn Reasons Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureChurnReasonPackRegistered(organizationId, projectId, owner.id);
  });

  it('registers the churn_reason event schema', async () => {
    const schemaDef = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'churn_reason');
    expect(schemaDef).not.toBeNull();
    expect(schemaDef?.field_defs.map((field) => field.name)).toEqual(['category', 'reason_text']);
  });

  it('registers churn_events as active v1: count(fact_churn_reason), breakdown by category/channel/plan/cohort', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(1);

    const metric = await getActiveMetricDefinition(organizationId, projectId, 'churn_events');
    expect(metric?.version).toBe(1);
    expect(metric?.status).toBe('active');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count',
      table: 'fact_churn_reason',
      timeColumn: 'ts',
      filters: [],
    });
    expect(metric?.dimensions).toEqual(['category', 'channel_id', 'plan', 'cohort_month']);
  });
});

describe('ensureChurnReasonPackRegistered — idempotency and isolation', () => {
  it('leaves a metric pre-registered by a human alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'churn_events',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_churn_export', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['churn_events']);
    expect(result.registered).toEqual([]);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual(['churn_events']);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(1);
    expect(defs[0]?.version).toBe(1);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureChurnReasonPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'churn_events');
    expect(metricInOtherProject).toBeNull();
    const schemaInOtherProject = await getActiveSchemaDefinition(organization.id, otherProject.id, 'event', 'churn_reason');
    expect(schemaInOtherProject).toBeNull();
  });
});
