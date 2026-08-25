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
import { GoogleAdsApiError, type GoogleAdsApiClient, type GoogleAdsCreateCampaignDraftResult } from './api-client';
import { GoogleAdsAdResourceUnknownError, GoogleAdsAutomationActionExecutor, GoogleAdsBudgetResourceUnknownError, GoogleAdsWrongPlatformCampaignDraftError } from './executor';

beforeAll(async () => {
  await connectToFirestoreEmulator('google-ads-executor-tests');
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

const CREATE_RESULT: GoogleAdsCreateCampaignDraftResult = {
  campaignResourceName: 'customers/999/campaigns/1',
  campaignBudgetResourceName: 'customers/999/campaignBudgets/1',
  adGroupResourceNames: ['customers/999/adGroups/1'],
  adResourceNames: ['customers/999/adGroupAds/1'],
};

function fakeApiClient(overrides: Partial<GoogleAdsApiClient> = {}): GoogleAdsApiClient {
  return {
    createCampaignDraft: vi.fn().mockResolvedValue(CREATE_RESULT),
    setCampaignBudgetAmount: vi.fn().mockResolvedValue(undefined),
    setCampaignStatus: vi.fn().mockResolvedValue(undefined),
    lookupCampaignBudgetResourceName: vi.fn().mockRejectedValue(new GoogleAdsApiError('No campaign found.', 404)),
    createCustomerMatchUserList: vi.fn().mockResolvedValue({ userListResourceName: 'customers/999/userLists/1' }),
    addHashedEmailsToCustomerMatchUserList: vi.fn().mockResolvedValue({ numReceived: 0 }),
    addAdGroupKeywords: vi.fn().mockResolvedValue({
      keywordResourceNames: ['customers/999/adGroupCriteria/1'],
      negativeKeywordResourceNames: ['customers/999/adGroupCriteria/2'],
    }),
    removeAdGroupCriteria: vi.fn().mockResolvedValue(undefined),
    createResponsiveSearchAd: vi.fn().mockResolvedValue({ adResourceName: 'customers/999/adGroupAds/2' }),
    setAdGroupAdStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const EDITED_RESPONSIVE_SEARCH_AD = {
  headlines: ['New Headline One', 'New Headline Two', 'New Headline Three'],
  descriptions: ['New description one.', 'New description two.'],
  finalUrl: 'https://example.com/new-widgets',
};

const DRAFT: GoogleAdsCampaignDraft = {
  platform: 'google_ads',
  campaignName: 'Winning Themes',
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

describe('GoogleAdsAutomationActionExecutor', () => {
  it('creates a campaign draft, storing the real resource names on the target', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Create Org');
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
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');

    const result = await executor.executeCampaignDraftCreate({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      draft: DRAFT,
    });

    expect(result).toEqual({ campaignResourceName: CREATE_RESULT.campaignResourceName });
    expect(apiClient.createCampaignDraft).toHaveBeenCalledWith('999', DRAFT);

    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_resource_name).toBe(CREATE_RESULT.campaignResourceName);
    expect(reloaded.campaign_budget_resource_name).toBe(CREATE_RESULT.campaignBudgetResourceName);
    expect(reloaded.campaign_status).toBe('paused');
    expect(reloaded.daily_budget_usd).toBe(25);
    expect(reloaded.ad_group_resource_names).toEqual(CREATE_RESULT.adGroupResourceNames);
    expect(reloaded.ad_resource_names).toEqual(CREATE_RESULT.adResourceNames);
  });

  it('rolls back a campaign draft creation by setting the campaign REMOVED', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Rollback Create Org');
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
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    await executor.rollbackCampaignDraftCreate({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      campaignResourceName: CREATE_RESULT.campaignResourceName,
    });

    expect(apiClient.setCampaignStatus).toHaveBeenCalledWith('999', CREATE_RESULT.campaignResourceName, 'REMOVED');
    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_status).toBe('removed');
  });

  it('activates and rolls back activation', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Activation Org');
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
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    await executor.executeCampaignActivation({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      campaignResourceName: CREATE_RESULT.campaignResourceName,
    });
    expect(apiClient.setCampaignStatus).toHaveBeenCalledWith('999', CREATE_RESULT.campaignResourceName, 'ENABLED');
    let [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_status).toBe('enabled');

    await executor.rollbackCampaignActivation({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      campaignResourceName: CREATE_RESULT.campaignResourceName,
    });
    expect(apiClient.setCampaignStatus).toHaveBeenCalledWith('999', CREATE_RESULT.campaignResourceName, 'PAUSED');
    [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_status).toBe('paused');
  });

  it('changes and rolls back a budget on a campaign this plugin created', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Budget Org');
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
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
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
    expect(apiClient.setCampaignBudgetAmount).toHaveBeenCalledWith('999', CREATE_RESULT.campaignBudgetResourceName, 50);

    await executor.rollbackBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 25,
      afterDailyBudgetUsd: 50,
    });
    expect(apiClient.setCampaignBudgetAmount).toHaveBeenCalledWith('999', CREATE_RESULT.campaignBudgetResourceName, 25);
  });

  it('throws GoogleAdsBudgetResourceUnknownError for a budget change against a target this plugin never created', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor No Budget Resource Org');
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
    const executor = new GoogleAdsAutomationActionExecutor(fakeApiClient(), '999');

    await expect(
      executor.executeBudgetChange({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        beforeDailyBudgetUsd: 100,
        afterDailyBudgetUsd: 120,
      }),
    ).rejects.toBeInstanceOf(GoogleAdsBudgetResourceUnknownError);
  });

  it('resolves and caches the budget resource name via GAQL lookup for a pre-existing campaign target, then reuses it without a second lookup', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Lookup Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Pre-existing Campaign Target',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient({
      lookupCampaignBudgetResourceName: vi.fn().mockResolvedValue('customers/999/campaignBudgets/42'),
    });
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');

    const result = await executor.executeBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 120,
    });
    expect(result).toEqual({ actualDailyBudgetUsd: 120 });
    expect(apiClient.lookupCampaignBudgetResourceName).toHaveBeenCalledWith('999', target.id);
    expect(apiClient.setCampaignBudgetAmount).toHaveBeenCalledWith('999', 'customers/999/campaignBudgets/42', 120);

    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_resource_name).toBe(target.id);
    expect(reloaded.campaign_budget_resource_name).toBe('customers/999/campaignBudgets/42');

    await executor.rollbackBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 120,
    });
    expect(apiClient.lookupCampaignBudgetResourceName).toHaveBeenCalledTimes(1);
    expect(apiClient.setCampaignBudgetAmount).toHaveBeenCalledWith('999', 'customers/999/campaignBudgets/42', 100);
  });

  it('throws GoogleAdsWrongPlatformCampaignDraftError for a platform: "meta" draft (KAN-73 cross-provider isolation)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Wrong Platform Org');
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
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
    const metaDraft: MetaCampaignDraft = {
      platform: 'meta',
      campaignName: 'Meta Campaign',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudgetUsd: 25,
      adSets: [
        {
          name: 'Ad Set 1',
          targeting: { countries: ['US'], ageMin: 18, ageMax: 45 },
          ad: { name: 'Ad 1', creative: { primaryText: 'Hello', headline: 'Hi', linkUrl: 'https://example.com' } },
        },
      ],
    };

    await expect(
      executor.executeCampaignDraftCreate({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        draft: metaDraft,
      }),
    ).rejects.toBeInstanceOf(GoogleAdsWrongPlatformCampaignDraftError);
    expect(apiClient.createCampaignDraft).not.toHaveBeenCalled();
  });

  it('adds keywords to an existing ad group, returning the real resource names Google Ads assigned (KAN-72 follow-up)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Keyword Edit Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Keyword Edit Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');

    const result = await executor.executeKeywordEdit({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      adGroupResourceName: 'customers/999/adGroups/1',
      addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
      addNegativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
    });

    expect(result).toEqual({
      addedKeywordResourceNames: ['customers/999/adGroupCriteria/1'],
      addedNegativeKeywordResourceNames: ['customers/999/adGroupCriteria/2'],
    });
    expect(apiClient.addAdGroupKeywords).toHaveBeenCalledWith(
      '999',
      'customers/999/adGroups/1',
      [{ text: 'blue widgets', matchType: 'PHRASE' }],
      [{ text: 'free', matchType: 'BROAD' }],
    );
  });

  it('rolls back a keyword edit by removing exactly the criteria it added', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Keyword Rollback Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Keyword Rollback Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');

    await executor.rollbackKeywordEdit({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      addedKeywordResourceNames: ['customers/999/adGroupCriteria/1'],
      addedNegativeKeywordResourceNames: ['customers/999/adGroupCriteria/2'],
    });

    expect(apiClient.removeAdGroupCriteria).toHaveBeenCalledWith('999', ['customers/999/adGroupCriteria/1', 'customers/999/adGroupCriteria/2']);
  });

  it('does not call removeAdGroupCriteria on rollback when nothing was ever added (e.g. a failed execution)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Keyword Rollback Noop Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Keyword Rollback Noop Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');

    await executor.rollbackKeywordEdit({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      addedKeywordResourceNames: [],
      addedNegativeKeywordResourceNames: [],
    });

    expect(apiClient.removeAdGroupCriteria).not.toHaveBeenCalled();
  });

  it('replaces an ad group\'s RSA with a new one, pausing the superseded ad and updating ad_resource_names in place (KAN-72 follow-up)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Ad Edit Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Ad Edit Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    const result = await executor.executeAdEdit({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      previousAdResourceName: CREATE_RESULT.adResourceNames[0],
      responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
    });

    expect(result).toEqual({ newAdResourceName: 'customers/999/adGroupAds/2' });
    expect(apiClient.createResponsiveSearchAd).toHaveBeenCalledWith('999', CREATE_RESULT.adGroupResourceNames[0], EDITED_RESPONSIVE_SEARCH_AD, 'ENABLED');
    expect(apiClient.setAdGroupAdStatus).toHaveBeenCalledWith('999', CREATE_RESULT.adResourceNames[0], 'PAUSED');

    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.ad_resource_names).toEqual(['customers/999/adGroupAds/2']);
  });

  it('rejects an ad_edit for an ad resource name that is not one of this target\'s own ads', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Ad Edit Unknown Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Ad Edit Unknown Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });

    await expect(
      executor.executeAdEdit({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        previousAdResourceName: 'customers/999/adGroupAds/not-this-targets',
        responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
      }),
    ).rejects.toBeInstanceOf(GoogleAdsAdResourceUnknownError);
    expect(apiClient.createResponsiveSearchAd).not.toHaveBeenCalled();
  });

  it('rolls back an ad edit by removing the new ad and restoring the previous ad to ENABLED', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GAds Executor Ad Edit Rollback Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Ad Edit Rollback Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new GoogleAdsAutomationActionExecutor(apiClient, '999');
    await executor.executeCampaignDraftCreate({ organizationId: organization.id, projectId: project.id, environmentId: 'live', targetId: target.id, draft: DRAFT });
    await executor.executeAdEdit({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      previousAdResourceName: CREATE_RESULT.adResourceNames[0],
      responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
    });

    await executor.rollbackAdEdit({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      previousAdResourceName: CREATE_RESULT.adResourceNames[0],
      newAdResourceName: 'customers/999/adGroupAds/2',
    });

    expect(apiClient.setAdGroupAdStatus).toHaveBeenCalledWith('999', 'customers/999/adGroupAds/2', 'REMOVED');
    expect(apiClient.setAdGroupAdStatus).toHaveBeenCalledWith('999', CREATE_RESULT.adResourceNames[0], 'ENABLED');

    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.ad_resource_names).toEqual(CREATE_RESULT.adResourceNames);
  });
});
