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
import { ensureRepCollectionsPackRegistered } from './index';

/** Emulator-backed tests for KAN-88's Rep Collections pack — mirrors `campaign-ops-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('rep-collections-pack-tests');
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

describe('ensureRepCollectionsPackRegistered — metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rep Collections Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureRepCollectionsPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers the one metric as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(1);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it('registers collected_revenue_by_customer: sum(fact_revenue_event.amount) over succeeded charges, dimensioned by customer_id', async () => {
    const metric = await activeMetric('collected_revenue_by_customer');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'fact_revenue_event',
      column: 'amount',
      timeColumn: 'ts',
      filters: [
        { field: 'status', operator: '=', value: 'succeeded' },
        { field: 'type', operator: '=', value: 'charge' },
      ],
    });
    expect(metric?.dimensions).toEqual(['customer_id']);
  });

  // Regression guard: `fact_revenue_event` emits a synthetic `first_charge` row alongside each
  // customer's first succeeded `charge` for the same amount, so dropping this filter would
  // double-count every customer's first payment and skew the leaderboard ranking toward reps
  // with more new customers. See this pack's `metrics.ts` doc comment.
  it("filters on type = 'charge' so a customer's synthetic first_charge row is never double-counted", async () => {
    const metric = await activeMetric('collected_revenue_by_customer');
    expect(metric?.aggregation?.filters).toContainEqual({ field: 'type', operator: '=', value: 'charge' });
  });
});

describe('ensureRepCollectionsPackRegistered — idempotency and isolation', () => {
  it('leaves a metric pre-registered by a human alone', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'collected_revenue_by_customer',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'legacy_export', column: 'amount', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['collected_revenue_by_customer']);
    expect(result.registered).toEqual([]);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toEqual(['collected_revenue_by_customer']);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(1);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureRepCollectionsPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'collected_revenue_by_customer');
    expect(metricInOtherProject).toBeNull();
  });
});
