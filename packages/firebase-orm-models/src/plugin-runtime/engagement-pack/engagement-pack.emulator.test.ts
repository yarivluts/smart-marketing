import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
  type MetricDefModel,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureEngagementPackRegistered } from './index';

/**
 * Emulator-backed tests for KAN-63's Engagement pack — mirrors
 * `saas-metric-pack.emulator.test.ts`'s own shape exactly: one assertion
 * block per AC-listed metric name, shared across a single `beforeAll`
 * registration (this package's Firestore emulator is documented as prone to
 * a flake under many-round-trip load — see that file's own note), plus
 * idempotency and project-isolation coverage.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('engagement-pack-tests');
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
  const { project } = await createProject({ organizationId: organization.id, name: 'App' });
  return { owner, organization, project };
}

describe('ensureEngagementPackRegistered — per-metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Engagement Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureEngagementPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers all five metrics as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(5);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  const ACTIVE_CUSTOMERS_AGGREGATION = { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [] };

  it('registers dau: count_distinct(fact_funnel_event.customer_id) — queried at grain=day', async () => {
    const metric = await activeMetric('dau');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual(ACTIVE_CUSTOMERS_AGGREGATION);
    expect(metric?.dimensions).toEqual([]);
  });

  it('registers wau: the same aggregation as dau — queried at grain=week', async () => {
    const metric = await activeMetric('wau');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual(ACTIVE_CUSTOMERS_AGGREGATION);
  });

  it('registers mau: the same aggregation as dau — queried at grain=month', async () => {
    const metric = await activeMetric('mau');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual(ACTIVE_CUSTOMERS_AGGREGATION);
  });

  it('registers dau_mau_ratio: avg(fact_engagement_daily.dau_mau_ratio) — the stickiness ratio', async () => {
    const metric = await activeMetric('dau_mau_ratio');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'avg',
      table: 'fact_engagement_daily',
      column: 'dau_mau_ratio',
      timeColumn: 'activity_date',
      filters: [],
    });
  });

  it('registers engagement_depth_histogram: sum(fact_engagement_depth_histogram.customer_count) broken down by days_active_bucket', async () => {
    const metric = await activeMetric('engagement_depth_histogram');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'fact_engagement_depth_histogram',
      column: 'customer_count',
      timeColumn: 'as_of_date',
      filters: [],
    });
    expect(metric?.dimensions).toEqual(['days_active_bucket']);
  });
});

describe('ensureEngagementPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone, the other four still register', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'dau',
      definition: {
        kind: 'aggregation',
        aggregation: { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [] },
      },
      dimensions: ['plan'], // deliberately different from the pack's own dimensions, to prove this pre-existing version is left untouched
      createdByUserId: owner.id,
    });

    const result = await ensureEngagementPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['dau']);
    expect(result.registered).toHaveLength(4);
    expect(result.registered).not.toContain('dau');

    const dau = await getActiveMetricDefinition(organization.id, project.id, 'dau');
    expect(dau?.dimensions).toEqual(['plan']);
    expect(dau?.version).toBe(1);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureEngagementPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureEngagementPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toHaveLength(5);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(5);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureEngagementPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'dau');
    expect(metricInOtherProject).toBeNull();
  });
});
