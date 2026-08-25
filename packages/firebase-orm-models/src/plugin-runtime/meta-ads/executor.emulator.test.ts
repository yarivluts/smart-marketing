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
import { MetaAdsApiError, type MetaAdsApiClient } from './api-client';
import {
  MetaAdEditNotSupportedError,
  MetaAdSetNotOwnedByTargetError,
  MetaAdsBudgetResourceUnknownError,
  MetaAdsWrongPlatformCampaignDraftError,
  MetaAutomationActionExecutor,
  MetaKeywordEditNotSupportedError,
} from './executor';

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
    getCampaign: vi.fn().mockRejectedValue(new MetaAdsApiError('No campaign found.', 404)),
    getAdSet: vi.fn().mockResolvedValue({ adSetId: 'adset-1', dailyBudgetCents: 2500, status: 'ACTIVE' }),
    updateAdSet: vi.fn().mockResolvedValue(undefined),
    createCustomAudience: vi.fn().mockResolvedValue({ audienceId: 'audience-1' }),
    addContactsToCustomAudience: vi.fn().mockResolvedValue({ numReceived: 0 }),
    uploadAdImage: vi.fn().mockResolvedValue({ imageHash: 'image-hash-1' }),
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
    expect(reloaded.meta_ad_set_resource_names).toEqual(['adset-1']);
  });

  it('uploads a creative image before creating the ad creative when imageDataUrl is present, and skips the upload when absent', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Image Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Image Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');
    const draftWithImage: MetaCampaignDraft = {
      ...DRAFT,
      adSets: [
        {
          ...DRAFT.adSets[0],
          ad: { ...DRAFT.adSets[0].ad, creative: { ...DRAFT.adSets[0].ad.creative, imageDataUrl: 'data:image/png;base64,AAAA' } },
        },
      ],
    };

    await executor.executeCampaignDraftCreate({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      draft: draftWithImage,
    });

    expect(apiClient.uploadAdImage).toHaveBeenCalledWith('999', { base64Bytes: 'AAAA' });
    expect(apiClient.createAdCreative).toHaveBeenCalledWith(
      '999',
      expect.objectContaining({ imageHash: 'image-hash-1' }),
    );
    const uploadOrder = (apiClient.uploadAdImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const createAdCreativeOrder = (apiClient.createAdCreative as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(createAdCreativeOrder);

    // Absent imageDataUrl (the DRAFT fixture used by every other test in this
    // file): no image upload call at all, and no `imageHash` key on the
    // createAdCreative params — not even `imageHash: undefined`.
    const apiClientNoImage = fakeApiClient();
    const executorNoImage = new MetaAutomationActionExecutor(apiClientNoImage, '999', 'page-1');
    const otherTarget = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'No Image Target',
      initialDailyBudgetUsd: 0,
      seededByUserId: owner.id,
    });
    await executorNoImage.executeCampaignDraftCreate({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: otherTarget.id,
      draft: DRAFT,
    });
    expect(apiClientNoImage.uploadAdImage).not.toHaveBeenCalled();
    const noImageCreativeCall = (apiClientNoImage.createAdCreative as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect('imageHash' in noImageCreativeCall).toBe(false);
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

  it('resolves and caches the budget resource name via a live lookup for a pre-existing campaign target, then reuses it without a second lookup', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Executor Lookup Org');
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
    const apiClient = fakeApiClient({ getCampaign: vi.fn().mockResolvedValue({ campaignId: target.id }) });
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');

    const result = await executor.executeBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 120,
    });
    expect(result).toEqual({ actualDailyBudgetUsd: 120 });
    expect(apiClient.getCampaign).toHaveBeenCalledWith(target.id);
    expect(apiClient.setDailyBudgetCents).toHaveBeenCalledWith(target.id, 12000);

    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloaded.campaign_resource_name).toBe(target.id);
    expect(reloaded.campaign_budget_resource_name).toBe(target.id);

    await executor.rollbackBudgetChange({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: target.id,
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 120,
    });
    expect(apiClient.getCampaign).toHaveBeenCalledTimes(1);
    expect(apiClient.setDailyBudgetCents).toHaveBeenCalledWith(target.id, 10000);
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

  it('throws MetaKeywordEditNotSupportedError for executeKeywordEdit — Meta has no ad-group/keyword concept (KAN-72 follow-up)', async () => {
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');

    await expect(
      executor.executeKeywordEdit({
        organizationId: 'org-1',
        projectId: 'project-1',
        environmentId: 'live',
        targetId: 'target-1',
        adGroupResourceName: 'irrelevant',
        addKeywords: [],
        addNegativeKeywords: [],
      }),
    ).rejects.toBeInstanceOf(MetaKeywordEditNotSupportedError);
  });

  it('throws MetaKeywordEditNotSupportedError for rollbackKeywordEdit', async () => {
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');

    await expect(
      executor.rollbackKeywordEdit({
        organizationId: 'org-1',
        projectId: 'project-1',
        environmentId: 'live',
        targetId: 'target-1',
        addedKeywordResourceNames: [],
        addedNegativeKeywordResourceNames: [],
      }),
    ).rejects.toBeInstanceOf(MetaKeywordEditNotSupportedError);
  });

  describe('executeMetaAdSetEdit / rollbackMetaAdSetEdit (KAN-73 follow-up)', () => {
    async function seedTargetWithAdSet(organizationId: string, projectId: string, ownerId: string, apiClient: MetaAdsApiClient) {
      const target = await ensureAutomationTargetSeeded({
        organizationId,
        projectId,
        environmentId: 'live',
        targetId: unique('campaign'),
        targetType: 'campaign',
        label: 'Ad Set Edit Target',
        initialDailyBudgetUsd: 0,
        seededByUserId: ownerId,
      });
      const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');
      await executor.executeCampaignDraftCreate({ organizationId, projectId, environmentId: 'live', targetId: target.id, draft: DRAFT });
      const [reloaded] = await listAutomationTargetStatesForProject(organizationId, projectId);
      return { target: reloaded, executor };
    }

    it('edits an ad set\'s budget and status, reading the real pre-edit values live', async () => {
      const { owner, organization, project } = await setupOrgWithProject('Meta Executor Ad Set Edit Org');
      const apiClient = fakeApiClient({ getAdSet: vi.fn().mockResolvedValue({ adSetId: 'adset-1', dailyBudgetCents: 2500, status: 'ACTIVE' }) });
      const { target, executor } = await seedTargetWithAdSet(organization.id, project.id, owner.id, apiClient);

      const result = await executor.executeMetaAdSetEdit({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        adSetResourceName: 'adset-1',
        dailyBudgetUsd: 40,
        status: 'paused',
      });

      expect(result).toEqual({ previousDailyBudgetUsd: 25, previousStatus: 'enabled' });
      expect(apiClient.getAdSet).toHaveBeenCalledWith('adset-1');
      expect(apiClient.updateAdSet).toHaveBeenCalledWith('adset-1', { dailyBudgetCents: 4000, status: 'PAUSED' });
    });

    it('edits only budget when status is omitted, leaving status untouched in the updateAdSet call', async () => {
      const { owner, organization, project } = await setupOrgWithProject('Meta Executor Ad Set Budget Only Org');
      const apiClient = fakeApiClient();
      const { target, executor } = await seedTargetWithAdSet(organization.id, project.id, owner.id, apiClient);

      const result = await executor.executeMetaAdSetEdit({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        adSetResourceName: 'adset-1',
        dailyBudgetUsd: 40,
      });

      expect(result).toEqual({ previousDailyBudgetUsd: 25 });
      expect(apiClient.updateAdSet).toHaveBeenCalledWith('adset-1', { dailyBudgetCents: 4000 });
    });

    it('rolls back an ad set edit by re-applying the captured pre-edit values', async () => {
      const { owner, organization, project } = await setupOrgWithProject('Meta Executor Ad Set Edit Rollback Org');
      const apiClient = fakeApiClient();
      const { target, executor } = await seedTargetWithAdSet(organization.id, project.id, owner.id, apiClient);

      await executor.rollbackMetaAdSetEdit({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        adSetResourceName: 'adset-1',
        beforeDailyBudgetUsd: 25,
        beforeStatus: 'enabled',
      });

      expect(apiClient.updateAdSet).toHaveBeenCalledWith('adset-1', { dailyBudgetCents: 2500, status: 'ACTIVE' });
    });

    it('does not call updateAdSet on rollback when neither field was ever touched', async () => {
      const { owner, organization, project } = await setupOrgWithProject('Meta Executor Ad Set Edit Rollback Noop Org');
      const apiClient = fakeApiClient();
      const { target, executor } = await seedTargetWithAdSet(organization.id, project.id, owner.id, apiClient);

      await executor.rollbackMetaAdSetEdit({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: target.id,
        adSetResourceName: 'adset-1',
      });

      expect(apiClient.updateAdSet).not.toHaveBeenCalled();
    });

    it('throws MetaAdSetNotOwnedByTargetError for an ad set that is not one of this target\'s own ad sets', async () => {
      const { owner, organization, project } = await setupOrgWithProject('Meta Executor Wrong Ad Set Org');
      const apiClient = fakeApiClient();
      const { target, executor } = await seedTargetWithAdSet(organization.id, project.id, owner.id, apiClient);

      await expect(
        executor.executeMetaAdSetEdit({
          organizationId: organization.id,
          projectId: project.id,
          environmentId: 'live',
          targetId: target.id,
          adSetResourceName: 'act_999/adsets/not-this-targets',
          dailyBudgetUsd: 40,
        }),
      ).rejects.toBeInstanceOf(MetaAdSetNotOwnedByTargetError);
      expect(apiClient.getAdSet).not.toHaveBeenCalled();
      expect(apiClient.updateAdSet).not.toHaveBeenCalled();
    });
  });

  it('throws MetaAdEditNotSupportedError for executeAdEdit — Meta has no Responsive Search Ad concept (KAN-72 follow-up)', async () => {
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');

    await expect(
      executor.executeAdEdit({
        organizationId: 'org-1',
        projectId: 'project-1',
        environmentId: 'live',
        targetId: 'target-1',
        previousAdResourceName: 'irrelevant',
        responsiveSearchAd: { headlines: ['A', 'B', 'C'], descriptions: ['D', 'E'], finalUrl: 'https://example.com' },
      }),
    ).rejects.toBeInstanceOf(MetaAdEditNotSupportedError);
  });

  it('throws MetaAdEditNotSupportedError for rollbackAdEdit', async () => {
    const apiClient = fakeApiClient();
    const executor = new MetaAutomationActionExecutor(apiClient, '999', 'page-1');

    await expect(
      executor.rollbackAdEdit({
        organizationId: 'org-1',
        projectId: 'project-1',
        environmentId: 'live',
        targetId: 'target-1',
        previousAdResourceName: 'irrelevant',
        newAdResourceName: 'irrelevant-2',
      }),
    ).rejects.toBeInstanceOf(MetaAdEditNotSupportedError);
  });
});
