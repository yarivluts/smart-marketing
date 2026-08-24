import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  deleteCampaignTargetBudget,
  ensureUserForFirebaseSession,
  ensureCampaignOpsPackRegistered,
  ensureSaasMetricPackRegistered,
  ensureSaasMetricPackSchemasRegistered,
  getCampaignSpendBreakdownForProject,
  getPaybackOverviewForProject,
  getQualityCalibrationBreakdownForProject,
  InMemoryMetricQueryResultCache,
  InvalidCampaignTargetError,
  listCampaignTargetsForProject,
  ProjectNotFoundError,
  setCampaignTargetBudget,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-86's per-campaign spend targets (`campaign-target.service.ts`). */

beforeAll(async () => {
  await connectToFirestoreEmulator('campaign-target-tests');
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

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

describe('setCampaignTargetBudget', () => {
  it('creates a target, then a second call overwrites it (upsert by campaign_id, not a new document)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Target Create Org');

    const first = await setCampaignTargetBudget({
      organizationId: organization.id,
      projectId: project.id,
      campaignId: 'summer_search',
      monthlyBudget: 500,
      updatedByUserId: owner.id,
    });
    expect(first.monthly_budget).toBe(500);
    expect(first.created_by).toBe(owner.id);

    const second = await setCampaignTargetBudget({
      organizationId: organization.id,
      projectId: project.id,
      campaignId: 'summer_search',
      monthlyBudget: 750,
      updatedByUserId: owner.id,
    });
    expect(second.id).toBe(first.id);
    expect(second.monthly_budget).toBe(750);

    const all = await listCampaignTargetsForProject(organization.id, project.id);
    expect(all).toHaveLength(1);
  });

  it('rejects an empty campaign id and a negative budget, collecting both reasons', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Target Invalid Org');

    await expect(
      setCampaignTargetBudget({
        organizationId: organization.id,
        projectId: project.id,
        campaignId: '   ',
        monthlyBudget: -10,
        updatedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidCampaignTargetError);
  });

  it('throws ProjectNotFoundError for a project id from a different org', async () => {
    const { owner, organization } = await setupOrgWithProject('Campaign Target Org A');
    const { project: otherProject } = await setupOrgWithProject('Campaign Target Org B');

    await expect(
      setCampaignTargetBudget({
        organizationId: organization.id,
        projectId: otherProject.id,
        campaignId: 'x',
        monthlyBudget: 1,
        updatedByUserId: owner.id,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('deleteCampaignTargetBudget', () => {
  it('removes a target; deleting a campaign with no target is a no-op', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Target Delete Org');
    await setCampaignTargetBudget({ organizationId: organization.id, projectId: project.id, campaignId: 'brand', monthlyBudget: 100, updatedByUserId: owner.id });

    await deleteCampaignTargetBudget(organization.id, project.id, 'brand');
    expect(await listCampaignTargetsForProject(organization.id, project.id)).toEqual([]);

    await expect(deleteCampaignTargetBudget(organization.id, project.id, 'never_existed')).resolves.toBeUndefined();
  });
});

describe('getCampaignSpendBreakdownForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Spend Unconfigured Org');
    await ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id);
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getCampaignSpendBreakdownForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when ad_spend is not registered yet', async () => {
    const { organization, project } = await setupOrgWithProject('Campaign Spend Unregistered Org');
    const executor = new FakeWarehouseQueryExecutor([]);
    const outcome = await getCampaignSpendBreakdownForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('merges actual spend with saved targets: over/on/no-target, and a targeted campaign with zero spend in the window still appears', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Campaign Spend Merge Org');
    await ensureSaasMetricPackSchemasRegistered(organization.id, project.id, owner.id);
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    await setCampaignTargetBudget({ organizationId: organization.id, projectId: project.id, campaignId: 'over_budget_campaign', monthlyBudget: 100, updatedByUserId: owner.id });
    await setCampaignTargetBudget({ organizationId: organization.id, projectId: project.id, campaignId: 'on_budget_campaign', monthlyBudget: 100, updatedByUserId: owner.id });
    await setCampaignTargetBudget({ organizationId: organization.id, projectId: project.id, campaignId: 'zero_spend_campaign', monthlyBudget: 50, updatedByUserId: owner.id });

    const rows: WarehouseRow[] = [
      { bucket_date: '2026-01-01', campaign_id: 'over_budget_campaign', ad_spend: 90 },
      { bucket_date: '2026-01-02', campaign_id: 'over_budget_campaign', ad_spend: 30 },
      { bucket_date: '2026-01-01', campaign_id: 'on_budget_campaign', ad_spend: 80 },
      { bucket_date: '2026-01-01', campaign_id: 'untargeted_campaign', ad_spend: 40 },
    ];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await getCampaignSpendBreakdownForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');

    const byId = new Map(outcome.rows.map((row) => [row.campaignId, row]));
    expect(byId.get('over_budget_campaign')).toEqual({ campaignId: 'over_budget_campaign', actualSpend: 120, monthlyBudget: 100, status: 'over_target' });
    expect(byId.get('on_budget_campaign')).toEqual({ campaignId: 'on_budget_campaign', actualSpend: 80, monthlyBudget: 100, status: 'on_target' });
    expect(byId.get('zero_spend_campaign')).toEqual({ campaignId: 'zero_spend_campaign', actualSpend: 0, monthlyBudget: 50, status: 'on_target' });
    expect(byId.get('untargeted_campaign')).toEqual({ campaignId: 'untargeted_campaign', actualSpend: 40, monthlyBudget: null, status: 'no_target' });
    expect(outcome.rows).toHaveLength(4);
  });
});

describe('getPaybackOverviewForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Payback Unconfigured Org');
    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getPaybackOverviewForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the pack is not installed yet', async () => {
    const { organization, project } = await setupOrgWithProject('Payback Unregistered Org');
    const outcome = await getPaybackOverviewForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('sums all four windows from one query result', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Payback Merge Org');
    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const rows: WarehouseRow[] = [
      { bucket_date: '2026-01-01', collection_7d: 100, collection_14d: 150, collection_30d: 180, collection_40d: 200 },
      { bucket_date: '2026-02-01', collection_7d: 20, collection_14d: 20, collection_30d: 20, collection_40d: 20 },
    ];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await getPaybackOverviewForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');
    expect(outcome.windows).toEqual([
      { windowDays: 7, collectedRevenue: 120 },
      { windowDays: 14, collectedRevenue: 170 },
      { windowDays: 30, collectedRevenue: 200 },
      { windowDays: 40, collectedRevenue: 220 },
    ]);
  });
});

describe('getQualityCalibrationBreakdownForProject', () => {
  it('degrades to a "warehouse not configured" outcome when no BigQuery project is wired up (buildable-today default)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Calibration Unconfigured Org');
    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const outcome = await getQualityCalibrationBreakdownForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "query error" outcome when the pack is not installed yet', async () => {
    const { organization, project } = await setupOrgWithProject('Calibration Unregistered Org');
    const outcome = await getQualityCalibrationBreakdownForProject(organization.id, project.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('query_error');
  });

  it('folds rows into a fixed low/medium/high row set, dividing once at the end (never re-averaging a per-bucket ratio)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Calibration Merge Org');
    await ensureCampaignOpsPackRegistered(organization.id, project.id, owner.id);

    const rows: WarehouseRow[] = [
      { bucket_date: '2026-01-01', quality_tier: 'high', quality_calibration_signups: 8, quality_calibration_paying_signups: 6, quality_calibration_collected_revenue_40d: 4000 },
      { bucket_date: '2026-02-01', quality_tier: 'high', quality_calibration_signups: 2, quality_calibration_paying_signups: 2, quality_calibration_collected_revenue_40d: 2000 },
      { bucket_date: '2026-01-01', quality_tier: 'low', quality_calibration_signups: 10, quality_calibration_paying_signups: 0, quality_calibration_collected_revenue_40d: 0 },
    ];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await getQualityCalibrationBreakdownForProject(organization.id, project.id, { executor, cache: new InMemoryMetricQueryResultCache() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok outcome');
    expect(outcome.tiers).toEqual([
      { qualityTier: 'low', signups: 10, payingSignups: 0, payingRate: 0, collectedRevenue40d: 0, avgCollectedRevenue40d: 0 },
      { qualityTier: 'medium', signups: 0, payingSignups: 0, payingRate: null, collectedRevenue40d: 0, avgCollectedRevenue40d: null },
      { qualityTier: 'high', signups: 10, payingSignups: 8, payingRate: 0.8, collectedRevenue40d: 6000, avgCollectedRevenue40d: 600 },
    ]);
  });
});
