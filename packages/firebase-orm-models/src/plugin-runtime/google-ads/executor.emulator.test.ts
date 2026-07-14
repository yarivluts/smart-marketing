import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CampaignDraft } from '../../automation-runtime';
import {
  createOrganizationWithOwner,
  createProject,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  listAutomationTargetStatesForProject,
} from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import type { GoogleAdsApiClient, GoogleAdsCreateCampaignDraftResult } from './api-client';
import { GoogleAdsAutomationActionExecutor, GoogleAdsBudgetResourceUnknownError } from './executor';

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
    ...overrides,
  };
}

const DRAFT: CampaignDraft = {
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
});
