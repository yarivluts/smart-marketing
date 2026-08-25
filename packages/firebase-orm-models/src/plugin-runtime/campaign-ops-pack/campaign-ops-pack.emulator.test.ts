import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureSaasMetricPackRegistered,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
  listMetricDefinitionsForProject,
  registerMetricDefinition,
  type MetricDefModel,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureCampaignOpsPackRegistered } from './index';

/** Emulator-backed tests for KAN-86's Campaign Ops pack — mirrors `feedback-pack.emulator.test.ts`'s own shape (one shared registration per describe block, idempotency, project isolation). */

beforeAll(async () => {
  await connectToFirestoreEmulator('campaign-ops-pack-tests');
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

describe('ensureCampaignOpsPackRegistered — metric definitions', () => {
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Ops Pack Org');
    organizationId = organization.id;
    projectId = project.id;
    await ensureCampaignOpsPackRegistered(organizationId, projectId, owner.id);
  });

  async function activeMetric(name: string): Promise<MetricDefModel | null> {
    return getActiveMetricDefinition(organizationId, projectId, name);
  }

  it('registers all fourteen metrics as active v1', async () => {
    const defs = await listMetricDefinitionsForProject(organizationId, projectId);
    expect(defs).toHaveLength(14);
    expect(defs.every((def) => def.version === 1 && def.status === 'active')).toBe(true);
  });

  it.each([
    ['collection_7d', 'collected_revenue_7d'],
    ['collection_14d', 'collected_revenue_14d'],
    ['collection_30d', 'collected_revenue_30d'],
    ['collection_40d', 'collected_revenue_40d'],
  ])('registers %s: sum(fact_customer_payback.%s), broken down by campaign_id', async (name, column) => {
    const metric = await activeMetric(name);
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.dimensions).toEqual(['campaign_id']);
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'fact_customer_payback',
      column,
      timeColumn: 'acquired_at',
      filters: [],
    });
  });

  it.each([
    ['roi_7d', 'collection_7d / ad_spend'],
    ['roi_14d', 'collection_14d / ad_spend'],
    ['roi_30d', 'collection_30d / ad_spend'],
    ['roi_40d', 'collection_40d / ad_spend'],
  ])('registers %s as a formula dividing its own collection_Nd by ad_spend, broken down by campaign_id', async (name, formula) => {
    const metric = await activeMetric(name);
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe(formula);
    expect(metric?.dimensions).toEqual(['campaign_id']);
  });

  it('registers ad_spend reused verbatim from the SaaS pack', async () => {
    const metric = await activeMetric('ad_spend');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.dimensions).toEqual(['channel_id', 'campaign_id', 'adset_id', 'ad_id']);
  });

  it('registers quality_calibration_signups: count_distinct(fact_quality_calibration.customer_id) by quality_tier', async () => {
    const metric = await activeMetric('quality_calibration_signups');
    expect(metric?.definition_kind).toBe('aggregation');
    expect(metric?.dimensions).toEqual(['quality_tier']);
    expect(metric?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_quality_calibration',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [],
    });
  });

  it('registers quality_calibration_paying_signups: filtered to is_paying_customer=true', async () => {
    const metric = await activeMetric('quality_calibration_paying_signups');
    expect(metric?.aggregation).toEqual({
      function: 'count_distinct',
      table: 'fact_quality_calibration',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'is_paying_customer', operator: '=', value: 'true' }],
    });
  });

  it('registers quality_calibration_collected_revenue_40d: sum(fact_quality_calibration.collected_revenue_40d)', async () => {
    const metric = await activeMetric('quality_calibration_collected_revenue_40d');
    expect(metric?.aggregation).toEqual({
      function: 'sum',
      table: 'fact_quality_calibration',
      column: 'collected_revenue_40d',
      timeColumn: 'ts',
      filters: [],
    });
  });

  it.each([
    ['quality_calibration_paying_rate', 'quality_calibration_paying_signups / quality_calibration_signups'],
    ['quality_calibration_avg_collected_revenue_40d', 'quality_calibration_collected_revenue_40d / quality_calibration_signups'],
  ])('registers %s as a formula over the phase-1 calibration aggregations', async (name, formula) => {
    const metric = await activeMetric(name);
    expect(metric?.definition_kind).toBe('formula');
    expect(metric?.formula).toBe(formula);
    expect(metric?.dimensions).toEqual(['quality_tier']);
  });
});

describe('ensureCampaignOpsPackRegistered — idempotency and isolation', () => {
  it('partially idempotent: a metric pre-registered by a human is left alone, the other thirteen still register', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Partial Idempotent Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'collection_7d',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'legacy_payback_export', column: 'amount', timeColumn: 'reported_on', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const result = await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toEqual(['collection_7d']);
    expect(result.registered).toHaveLength(13);
    expect(result.registered).not.toContain('collection_7d');
  });

  // Explicit timeout override (see `vitest.config.ts`'s own doc comment on
  // the confirmed upstream Firestore-emulator RESOURCE_EXHAUSTED bug and why
  // it self-heals given enough wall-clock time within one attempt): this
  // test round-trips 28 real registrations (14 metrics x 2 calls,
  // 2026-08-25 follow-up grew this pack from 9 to 14), comfortably clearing
  // the global 120s default under normal load but not always with enough
  // margin left for the emulator's own self-heal under a full-suite run's
  // contention.
  it('is idempotent: a second call registers nothing new and creates no duplicate versions', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Org');
    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const second = await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);
    expect(second.registered).toEqual([]);
    expect(second.alreadyRegistered).toHaveLength(14);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(14);
    expect(defs.every((def) => def.version === 1)).toBe(true);
  }, 300_000);

  it('is isolated per project: registering in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const metricInOtherProject = await getActiveMetricDefinition(organization.id, otherProject.id, 'collection_7d');
    expect(metricInOtherProject).toBeNull();
  });

  it('reuses the SaaS pack\'s own ad_spend metric when it is already installed, rather than conflicting with it', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cross Pack Reuse Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const result = await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    expect(result.alreadyRegistered).toContain('ad_spend');
    const adSpendDefs = (await listMetricDefinitionsForProject(organization.id, project.id)).filter((def) => def.name === 'ad_spend');
    expect(adSpendDefs).toHaveLength(1);
  });
});
