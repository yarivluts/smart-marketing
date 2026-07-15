import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GoogleAdsCampaignDraft, MetaCampaignDraft } from '../../automation-runtime';
import {
  createOrganizationWithOwner,
  createProject,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  listAutomationTargetStatesForProject,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import type { MetaAdsApiClient } from './api-client';
import { MetaAdsBudgetResourceUnknownError, MetaAdsWrongPlatformCampaignDraftError, MetaAutomationActionExecutor } from './executor';

beforeAll(async () => {
  await connectToFirestoreEmulator('meta-ads-executor-tests');
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

function fakeApiClient(overrides: Partial<MetaAdsApiClient> = {}): MetaAdsApiClient {
  return {
    createCampaign: vi.fn().mockResolvedValue({ campaignId: 'campaign-1' }),
    createAdSet: vi.fn().mockResolvedValue({ adSetId: 'adset-1' }),
    createAdCreative: vi.fn().mockResolvedValue({ creativeId: 'creative-1' }),
    createAd: vi.fn().mockResolvedValue({ adId: 'ad-1' }),
    setDailyBudgetCents: vi.fn().mockResolvedValue(undefined),
    setObjectStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const DRAFT: MetaCampaignDraft = {
  platform: 'meta',
  campaignName: 'Summer Sale',
  objective: 'OUTCOME_TRAFFIC',
  dailyBudgetUsd: 25,
  adSets: [
    {
      name: 'Ad Set 1',
      targeting: { countries: ['US'], ageMin: 18, ageMax: 45 },
      ad: {
        name: 'Ad 1',
        creative: { primaryText: 'Big summer savings.', headline: 'Blue Widgets Sale', linkUrl: 'https://example.com/widgets' },
      },
    },
  ],
};

describe('MetaAutomationActionExecutor', () => {
  it('creates a campaign draft via campaign -> ad set -> creative -> ad, in order, storing resource names on the target', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Create Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Draft Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');

    const result = await executor.executeCampaignDraftCreate({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      draft: DRAFT,
    });

    expect(result).toEqual({ campaignResourceName: 'campaign-1' });
    expect(apiClient.createCampaign).toHaveBeenCalledWith('999', { name: 'Summer Sale', objective: 'OUTCOME_TRAFFIC', dailyBudgetCents: 2500 });
    expect(apiClient.createAdSet).toHaveBeenCalledWith('999', {
      campaignId: 'campaign-1',
      name: 'Ad Set 1',
      targeting: { countries: ['US'], ageMin: 18, ageMax: 45 },
    });
    expect(apiClient.createAdCreative).toHaveBeenCalledWith('999', {
      pageId: 'page-1',
      primaryText: 'Big summer savings.',
      headline: 'Blue Widgets Sale',
      linkUrl: 'https://example.com/widgets',
    });
    expect(apiClient.createAd).toHaveBeenCalledWith('999', { adSetId: 'adset-1', creativeId: 'creative-1', name: 'Ad 1' });

    const createCampaignOrder = (apiClient.createCampaign as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const createAdSetOrder = (apiClient.createAdSet as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const createAdCreativeOrder = (apiClient.createAdCreative as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const createAdOrder = (apiClient.createAd as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(createCampaignOrder).toBeLessThan(createAdSetOrder);
    expect(createAdSetOrder).toBeLessThan(createAdCreativeOrder);
    expect(createAdCreativeOrder).toBeLessThan(createAdOrder);

    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_resource_name).toBe('campaign-1');
    expect(reloaded.campaign_budget_resource_name).toBe('campaign-1');
    expect(reloaded.campaign_status).toBe('paused');
    expect(reloaded.daily_budget_usd).toBe(25);
  });

  it('rolls back a campaign draft creation by deleting the campaign', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Rollback Create Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Rollback Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    await executor.rollbackCampaignDraftCreate({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      campaignResourceName: 'campaign-1',
    });

    expect(apiClient.setObjectStatus).toHaveBeenCalledWith('campaign-1', 'DELETED');
    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_status).toBe('removed');
  });

  it('activates and rolls back activation', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Activation Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Activation Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    await executor.executeCampaignActivation({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      campaignResourceName: 'campaign-1',
    });
    expect(apiClient.setObjectStatus).toHaveBeenCalledWith('campaign-1', 'ACTIVE');
    let [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_status).toBe('enabled');

    await executor.rollbackCampaignActivation({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      campaignResourceName: 'campaign-1',
    });
    expect(apiClient.setObjectStatus).toHaveBeenCalledWith('campaign-1', 'PAUSED');
    [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_status).toBe('paused');
  });

  it('changes and rolls back a budget on a campaign this plugin created', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Budget Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Budget Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    const result = await executor.executeBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 25,
      afterDailyBudgetUsd: 50,
    });
    expect(result).toEqual({ actualDailyBudgetUsd: 50 });
    expect(apiClient.setDailyBudgetCents).toHaveBeenCalledWith('campaign-1', 5000);

    await executor.rollbackBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 25,
      afterDailyBudgetUsd: 50,
    });
    expect(apiClient.setDailyBudgetCents).toHaveBeenCalledWith('campaign-1', 2500);
  });

  it('throws MetaAdsBudgetResourceUnknownError for a budget change against a target this plugin never created', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor No Budget Resource Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Manually Seeded Target',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
    });
    const executor = new MetaAutomationActionExecutor(fakeApiClient(), '999', 'page-1');

    await expect(
      executor.executeBudgetChange({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        beforeDailyBudgetUsd: 100,
        afterDailyBudgetUsd: 120,
      }),
    ).rejects.toBeInstanceOf(MetaAdsBudgetResourceUnknownError);
  });

  it('throws MetaAdsWrongPlatformCampaignDraftError for a platform: "google_ads" draft (KAN-73 cross-provider isolation)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Wrong Platform Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Wrong Platform Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');
    const googleDraft: GoogleAdsCampaignDraft = {
      platform: 'google_ads',
      campaignName: 'Google Campaign',
      advertisingChannelType: 'SEARCH',
      dailyBudgetUsd: 25,
      adGroups: [
        {
          name: 'Ad Group 1',
          keywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
          negativeKeywords: [],
          responsiveSearchAd: {
            headlines: ['Buy Blue Widgets', 'Best Widgets Online', 'Widgets For Less'],
            descriptions: ['Free shipping on all widgets.', 'Order today, ships tomorrow.'],
            finalUrl: 'https://example.com/widgets',
          },
        },
      ],
    };

    await expect(
      executor.executeCampaignDraftCreate({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        draft: googleDraft,
      }),
    ).rejects.toBeInstanceOf(MetaAdsWrongPlatformCampaignDraftError);
    expect(apiClient.createCampaign).not.toHaveBeenCalled();
  });
});
