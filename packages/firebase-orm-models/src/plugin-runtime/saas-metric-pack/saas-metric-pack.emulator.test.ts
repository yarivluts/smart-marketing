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
import { ensureSaasMetricPackRegistered } from './index';

/**
 * Emulator-backed tests for KAN-59's SaaS/marketing metric pack. One
 * assertion block per KAN-59 AC-listed metric name (the "each has a
 * definition test" clause), plus idempotency and project-isolation
 * coverage shared with every other registry-backed service in this
 * package.
 *
 * The per-metric assertions all read from a single shared registration
 * (`beforeAll`, not one `ensureSaasMetricPackRegistered` call per `it`) —
 * this package's Firestore emulator is already documented (`vitest.
 * config.ts`) as prone to a "known emulator/client-SDK interaction" flake
 * under load, and twenty-two fresh registrations per assertion (~250+
 * Firestore round-trips across the file) reliably reproduced it in CI.
 * Sharing one registration cuts that by roughly 80% while still exercising
 * the exact same `ensureSaasMetricPackRegistered` code path.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('saas-metric-pack-tests');
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

describe('ensureSaasMetricPackRegistered — per-metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureSaasMetricPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers all twenty-two metrics (fourteen featured + eight supporting) as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(22);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it('registers ad_spend: sum(fact_ad_spend.reporting_spend) broken down by channel/campaign/adset/ad', async () => {
    const metric = await activeMetric('ad_spend');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({ function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] });
    expect(metric?.dimensions).toEqual(['channel_id', 'campaign_id', 'adset_id', 'ad_id']);
  });

  it('registers signups: count_distinct(fact_funnel_event.customer_id where step=signup)', async () => {
    const metric = await activeMetric('signups');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_funnel_event',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'step', operator: '=', value: 'signup' }],
    });
  });

  it('registers cost_per_signup: ad_spend / signups', async () => {
    const metric = await activeMetric('cost_per_signup');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('ad_spend / signups');
  });

  it('registers cac: ad_spend / new_paying', async () => {
    const metric = await activeMetric('cac');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('ad_spend / new_paying');
  });

  it('registers conversion_to_paying: new_paying / signups', async () => {
    const metric = await activeMetric('conversion_to_paying');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('new_paying / signups');
  });

  it('registers mrr: sum(dim_subscription.mrr where status=active)', async () => {
    const metric = await activeMetric('mrr');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'dim_subscription',
      column: 'mrr',
      timeColumn: 'started_at',
      filters: [{ field: 'status', operator: '=', value: 'active' }],
    });
  });

  it('registers mrr_movements: sum(fact_revenue_event.mrr_delta) broken down by type/plan', async () => {
    const metric = await activeMetric('mrr_movements');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({ function: 'sum', table: 'fact_revenue_event', column: 'mrr_delta', timeColumn: 'ts', filters: [] });
    expect(metric?.dimensions).toEqual(['type', 'plan']);
  });

  it('registers net_mrr_churn: (churned_mrr - expansion_mrr) / mrr', async () => {
    const metric = await activeMetric('net_mrr_churn');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('(churned_mrr - expansion_mrr) / mrr');
  });

  it('registers troi: attributed_gross_profit / ad_spend', async () => {
    const metric = await activeMetric('troi');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('attributed_gross_profit / ad_spend');
  });

  it('registers collected_revenue: sum(fact_revenue_event.amount where status=succeeded)', async () => {
    const metric = await activeMetric('collected_revenue');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'fact_revenue_event',
      column: 'amount',
      timeColumn: 'ts',
      filters: [{ field: 'status', operator: '=', value: 'succeeded' }],
    });
  });

  it('registers failed_charge_rate: failed_charges / total_charges', async () => {
    const metric = await activeMetric('failed_charge_rate');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('failed_charges / total_charges');
  });

  it('registers reactivations (KAN-66): count_distinct(fact_subscription_event.subscription_id where type=reactivate)', async () => {
    const metric = await activeMetric('reactivations');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_subscription_event',
      column: 'subscription_id',
      timeColumn: 'ts',
      filters: [{ field: 'type', operator: '=', value: 'reactivate' }],
    });
  });

  it('registers trials_active (KAN-66): count_distinct(dim_subscription.subscription_id where status=trialing)', async () => {
    const metric = await activeMetric('trials_active');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'dim_subscription',
      column: 'subscription_id',
      timeColumn: 'started_at',
      filters: [{ field: 'status', operator: '=', value: 'trialing' }],
    });
  });

  it('registers trial_conversion_rate (KAN-66): trial_conversions / trial_starts', async () => {
    const metric = await activeMetric('trial_conversion_rate');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('trial_conversions / trial_starts');
  });

  it('registers the supporting metrics every formula-kind metric depends on', async () => {
    const supportingNames = ['new_paying', 'expansion_mrr', 'churned_mrr', 'total_charges', 'failed_charges', 'attributed_gross_profit', 'trial_starts', 'trial_conversions'];
    for (const name of supportingNames) {
      const metric = await activeMetric(name);
      expect(metric, `expected supporting metric "${name}" to be registered`).not.toBeNull();
      expect(metric?.definition_kind).toBe('aggregation');
    }
  });
});

describe('ensureSaasMetricPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone, the other twenty-one still register', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: ['region'], // deliberately different from the pack's own dimensions, to prove this pre-existing version is left untouched
      createdByUserId: owner.id,
    });

    const result = await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['ad_spend']);
    expect(result.registered).toHaveLength(21);
    expect(result.registered).not.toContain('ad_spend');

    const adSpend = await getActiveMetricDefinition(organization.id, project.id, 'ad_spend');
    expect(adSpend?.dimensions).toEqual(['region']);
    expect(adSpend?.version).toBe(1);
  });

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toHaveLength(22);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(22);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  });

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'ad_spend');
    expect(metricInOtherProject).toBeNull();
  });
});
