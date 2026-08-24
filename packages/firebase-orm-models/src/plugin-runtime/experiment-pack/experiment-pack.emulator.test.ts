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
import { ensureExperimentPackRegistered } from './index';

/** Emulator-backed tests for KAN-89's Experiment pack — mirrors `churn-reason-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('experiment-pack-tests');
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

describe('ensureExperimentPackRegistered — schema + metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Experiment Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureExperimentPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers both the experiment_exposure and experiment_conversion event schemas', async () => {
    const exposureSchema = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'experiment_exposure');
    expect(exposureSchema).not.toBeNull();
    expect(exposureSchema?.field_defs.map((field) => field.name)).toEqual(['experiment_key', 'variant_key']);

    const conversionSchema = await getActiveSchemaDefinition(organizationId, projectId, 'event', 'experiment_conversion');
    expect(conversionSchema).not.toBeNull();
    expect(conversionSchema?.field_defs.map((field) => field.name)).toEqual(['experiment_key', 'variant_key']);
  });

  it('registers experiment_exposures/experiment_conversions as active v1, breaking down by experiment_key/variant_key', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(2);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);

    const exposures = await activeMetric('experiment_exposures');
    expect(exposures?.definition_kind).toBe('aggregation');
    expect(exposures?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_experiment_event',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'event_type', operator: '=', value: 'experiment_exposure' }],
    });
    expect(exposures?.dimensions).toEqual(['experiment_key', 'variant_key']);

    const conversions = await activeMetric('experiment_conversions');
    expect(conversions?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_experiment_event',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'event_type', operator: '=', value: 'experiment_conversion' }],
    });
    expect(conversions?.dimensions).toEqual(['experiment_key', 'variant_key']);
  });
});

describe('ensureExperimentPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'experiment_exposures',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'legacy_experiment_export', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureExperimentPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['experiment_exposures']);
    expect(result.registered).toEqual(['experiment_conversions']);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureExperimentPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureExperimentPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual(['experiment_exposures', 'experiment_conversions']);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(2);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureExperimentPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'experiment_exposures');
    expect(metricInOtherProject).toBeNull();
    const schemaInOtherProject = await getActiveSchemaDefinition(organization.id, otherProject.id, 'event', 'experiment_exposure');
    expect(schemaInOtherProject).toBeNull();
  });
});
