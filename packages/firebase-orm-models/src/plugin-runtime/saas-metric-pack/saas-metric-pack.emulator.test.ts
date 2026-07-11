import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureSaasMetricPackRegistered } from './index';

/**
 * Emulator-backed tests for KAN-59's SaaS/marketing metric pack. One `it`
 * per KAN-59 AC-listed metric name (the "each has a definition test"
 * clause), plus idempotency and project-isolation coverage shared with
 * every other registry-backed service in this package.
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

describe('ensureSaasMetricPackRegistered', () => {
  it('registers seventeen metrics (eleven featured + six supporting) on first call', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Metric Pack Org');
    const result = await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual([]);
    expect(result.registered).toHaveLength(17);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(17);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  }, 60_000); // seventeen sequential registerMetricDefinition round-trips (existence check + save + audit log each) — see vitest.config.ts's own note on this package's emulator timing

  it('registers ad_spend: sum(fact_ad_spend.reporting_spend) broken down by channel/campaign/adset/ad', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Ad Spend Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'ad_spend');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({ function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] });
    expect(metric?.dimensions).toEqual(['channel_id', 'campaign_id', 'adset_id', 'ad_id']);
  });

  it('registers signups: count_distinct(fact_funnel_event.customer_id where step=signup)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Signups Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'signups');
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
    const { owner, organization, project } = await setupOrgWithProject('Cost Per Signup Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'cost_per_signup');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('ad_spend / signups');
  });

  it('registers cac: ad_spend / new_paying', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cac Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'cac');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('ad_spend / new_paying');
  });

  it('registers conversion_to_paying: new_paying / signups', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Conversion To Paying Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'conversion_to_paying');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('new_paying / signups');
  });

  it('registers mrr: sum(dim_subscription.mrr where status=active)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Mrr Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'mrr');
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
    const { owner, organization, project } = await setupOrgWithProject('Mrr Movements Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'mrr_movements');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.aggregation).toEqual({ function: 'sum', table: 'fact_revenue_event', column: 'mrr_delta', timeColumn: 'ts', filters: [] });
    expect(metric?.dimensions).toEqual(['type', 'plan']);
  });

  it('registers net_mrr_churn: (churned_mrr - expansion_mrr) / mrr', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Net Mrr Churn Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'net_mrr_churn');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('(churned_mrr - expansion_mrr) / mrr');
  });

  it('registers troi: attributed_gross_profit / ad_spend', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Troi Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'troi');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('attributed_gross_profit / ad_spend');
  });

  it('registers collected_revenue: sum(fact_revenue_event.amount where status=succeeded)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Collected Revenue Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'collected_revenue');
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
    const { owner, organization, project } = await setupOrgWithProject('Failed Charge Rate Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metric = await getActiveMetricDefinition(organization.id, project.id, 'failed_charge_rate');
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe('failed_charges / total_charges');
  });

  it('registers the supporting metrics every formula-kind metric depends on', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Supporting Metrics Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const supportingNames = ['new_paying', 'expansion_mrr', 'churned_mrr', 'total_charges', 'failed_charges', 'attributed_gross_profit'];
    for (const name of supportingNames) {
      const metric = await getActiveMetricDefinition(organization.id, project.id, name);
      expect(metric, `expected supporting metric "${name}" to be registered`).not.toBeNull();
      expect(metric?.definition_kind).toBe('aggregation');
    }
  });

  it('partially idempotent: a metric pre-registered by a human is left alone, the other sixteen still register', async () => {
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
    expect(result.registered).toHaveLength(16);
    expect(result.registered).not.toContain('ad_spend');

    const adSpend = await getActiveMetricDefinition(organization.id, project.id, 'ad_spend');
    expect(adSpend?.dimensions).toEqual(['region']);
    expect(adSpend?.version).toBe(1);
  }, 60_000);

  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toHaveLength(17);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(17);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  }, 60_000); // two full seventeen-metric passes — see the first test's own timeout note

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'ad_spend');
    expect(metricInOtherProject).toBeNull();
  }, 60_000);
});
