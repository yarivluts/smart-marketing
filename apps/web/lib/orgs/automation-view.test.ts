import { describe, expect, it } from 'vitest';
import type { AutomationActionModel, AutomationTargetStateModel } from '@growthos/firebase-orm-models';
import { findCampaignDraftForTarget, toAutomationActionView, toAutomationTargetView } from './automation-view';

function action(overrides: Partial<AutomationActionModel> & Pick<AutomationActionModel, 'id'>): AutomationActionModel {
  return {
    organization_id: 'org-1',
    project_id: 'project-1',
    environment_id: 'live',
    action_type: 'campaign_draft_create',
    target_id: 'target-1',
    target_label: 'Summer Sale',
    before: {},
    after: {},
    status: 'awaiting_approval',
    guardrail_violations: [],
    requested_by_user_id: 'user-1',
    proposed_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  } as AutomationActionModel;
}

describe('toAutomationActionView / formatDiffValue (KAN-73)', () => {
  it('summarizes a Google Ads campaignDraft with its ad group count', () => {
    const view = toAutomationActionView(
      action({
        id: 'a1',
        after: {
          campaignDraft: {
            platform: 'google_ads',
            campaignName: 'Winning Themes',
            advertisingChannelType: 'SEARCH',
            dailyBudgetUsd: 25,
            adGroups: [{ name: 'Ad Group 1' }, { name: 'Ad Group 2' }],
          },
        },
      }),
    );

    const entry = view.diffEntries.find((candidate) => candidate.key === 'campaignDraft');
    expect(entry?.after).toBe('"Winning Themes" ($25/day, 2 ad group(s))');
  });

  it('summarizes a Meta campaignDraft with its ad set count, distinct from the Google Ads shape', () => {
    const view = toAutomationActionView(
      action({
        id: 'a2',
        after: {
          campaignDraft: {
            platform: 'meta',
            campaignName: 'Summer Sale',
            objective: 'OUTCOME_TRAFFIC',
            dailyBudgetUsd: 40,
            adSets: [{ name: 'Ad Set 1' }],
          },
        },
      }),
    );

    const entry = view.diffEntries.find((candidate) => candidate.key === 'campaignDraft');
    expect(entry?.after).toBe('"Summer Sale" ($40/day, Meta, 1 ad set(s))');
  });

  it('does not report 0 ad group(s) for a Meta draft (the pre-KAN-73 degradation this branch replaces)', () => {
    const view = toAutomationActionView(
      action({
        id: 'a3',
        after: {
          campaignDraft: {
            platform: 'meta',
            campaignName: 'Fall Sale',
            objective: 'OUTCOME_LEADS',
            dailyBudgetUsd: 10,
            adSets: [{ name: 'Ad Set 1' }, { name: 'Ad Set 2' }, { name: 'Ad Set 3' }],
          },
        },
      }),
    );

    const entry = view.diffEntries.find((candidate) => candidate.key === 'campaignDraft');
    expect(entry?.after).not.toContain('ad group');
    expect(entry?.after).toBe('"Fall Sale" ($10/day, Meta, 3 ad set(s))');
  });

  it('renders plain diff values (dailyBudgetUsd) unchanged', () => {
    const view = toAutomationActionView(
      action({ id: 'a4', action_type: 'budget_change', before: { dailyBudgetUsd: 100 }, after: { dailyBudgetUsd: 150 } }),
    );

    const entry = view.diffEntries.find((candidate) => candidate.key === 'dailyBudgetUsd');
    expect(entry).toEqual({ key: 'dailyBudgetUsd', before: 100, after: 150 });
  });

  it('summarizes a keyword edit\'s addKeywords/addNegativeKeywords as "text (matchType)" pairs (KAN-72 follow-up)', () => {
    const view = toAutomationActionView(
      action({
        id: 'a5',
        action_type: 'keyword_edit',
        before: { adGroupResourceName: 'customers/999/adGroups/1' },
        after: {
          adGroupResourceName: 'customers/999/adGroups/1',
          addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
          addNegativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
        },
      }),
    );

    expect(view.diffEntries.find((candidate) => candidate.key === 'addKeywords')?.after).toBe('blue widgets (PHRASE)');
    expect(view.diffEntries.find((candidate) => candidate.key === 'addNegativeKeywords')?.after).toBe('free (BROAD)');
  });

  it('renders a meta_ad_set_edit diff, widened post-execution with the real pre-edit values (KAN-73 follow-up)', () => {
    const view = toAutomationActionView(
      action({
        id: 'a6',
        action_type: 'meta_ad_set_edit',
        before: { adSetResourceName: 'act_999/adsets/1', dailyBudgetUsd: 25, adSetStatus: 'enabled' },
        after: { adSetResourceName: 'act_999/adsets/1', dailyBudgetUsd: 40, adSetStatus: 'paused' },
      }),
    );

    expect(view.diffEntries.find((candidate) => candidate.key === 'dailyBudgetUsd')).toEqual({ key: 'dailyBudgetUsd', before: 25, after: 40 });
    expect(view.diffEntries.find((candidate) => candidate.key === 'adSetStatus')).toEqual({ key: 'adSetStatus', before: 'enabled', after: 'paused' });
    expect(view.diffEntries.find((candidate) => candidate.key === 'adSetResourceName')).toEqual({
      key: 'adSetResourceName',
      before: 'act_999/adsets/1',
      after: 'act_999/adsets/1',
    });
  });

  it('summarizes a meta_ad_creative_edit\'s creative as "headline (primary text)", widened post-execution with the real creative ids (KAN-73 follow-up)', () => {
    const view = toAutomationActionView(
      action({
        id: 'a7',
        action_type: 'meta_ad_creative_edit',
        before: { adResourceName: 'act_999/ads/1', previousCreativeResourceName: 'creative-1' },
        after: {
          adResourceName: 'act_999/ads/1',
          creative: { primaryText: 'Even bigger savings.', headline: 'Blue Widgets Mega Sale', linkUrl: 'https://example.com/widgets' },
          newCreativeResourceName: 'creative-2',
        },
      }),
    );

    expect(view.diffEntries.find((candidate) => candidate.key === 'creative')?.after).toBe('"Blue Widgets Mega Sale" (Even bigger savings.)');
    expect(view.diffEntries.find((candidate) => candidate.key === 'previousCreativeResourceName')).toEqual({
      key: 'previousCreativeResourceName',
      before: 'creative-1',
      after: undefined,
    });
    expect(view.diffEntries.find((candidate) => candidate.key === 'newCreativeResourceName')).toEqual({
      key: 'newCreativeResourceName',
      before: undefined,
      after: 'creative-2',
    });
  });

  it('summarizes a meta_ad_set_targeting_edit\'s targeting as "countries (age range, genders)", widened post-execution with the real pre-edit spec (KAN-73 follow-up)', () => {
    const view = toAutomationActionView(
      action({
        id: 'a8',
        action_type: 'meta_ad_set_targeting_edit',
        before: { adSetResourceName: 'act_999/adsets/1', targeting: { countries: ['US'], ageMin: 18, ageMax: 65 } },
        after: { adSetResourceName: 'act_999/adsets/1', targeting: { countries: ['US', 'CA'], ageMin: 21, ageMax: 45, genders: ['female'] } },
      }),
    );

    expect(view.diffEntries.find((candidate) => candidate.key === 'targeting')).toEqual({
      key: 'targeting',
      before: 'US (18-65)',
      after: 'US, CA (21-45, female)',
    });
    expect(view.diffEntries.find((candidate) => candidate.key === 'adSetResourceName')).toEqual({
      key: 'adSetResourceName',
      before: 'act_999/adsets/1',
      after: 'act_999/adsets/1',
    });
  });
});

describe('toAutomationTargetView (KAN-73 follow-up)', () => {
  function target(overrides: Partial<AutomationTargetStateModel> & Pick<AutomationTargetStateModel, 'id'>): AutomationTargetStateModel {
    return {
      organization_id: 'org-1',
      project_id: 'project-1',
      environment_id: 'live',
      target_type: 'campaign',
      label: 'Summer Sale',
      daily_budget_usd: 25,
      seeded_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T00:00:00.000Z',
      ...overrides,
    } as AutomationTargetStateModel;
  }

  it('includes metaAdSetResourceNames when the target has them', () => {
    const view = toAutomationTargetView(target({ id: 't1', meta_ad_set_resource_names: ['act_999/adsets/1', 'act_999/adsets/2'] }));
    expect(view.metaAdSetResourceNames).toEqual(['act_999/adsets/1', 'act_999/adsets/2']);
  });

  it('omits metaAdSetResourceNames when the target has none (e.g. a Google Ads target)', () => {
    const view = toAutomationTargetView(target({ id: 't2', ad_group_resource_names: ['customers/999/adGroups/1'] }));
    expect(view.metaAdSetResourceNames).toBeUndefined();
    expect(view.adGroupResourceNames).toEqual(['customers/999/adGroups/1']);
  });

  it('includes metaAdResourceNames when the target has them', () => {
    const view = toAutomationTargetView(target({ id: 't3', meta_ad_resource_names: ['act_999/ads/1', 'act_999/ads/2'] }));
    expect(view.metaAdResourceNames).toEqual(['act_999/ads/1', 'act_999/ads/2']);
  });

  it('omits metaAdResourceNames when the target has none (e.g. a Google Ads target)', () => {
    const view = toAutomationTargetView(target({ id: 't4', ad_resource_names: ['customers/999/adGroupAds/1'] }));
    expect(view.metaAdResourceNames).toBeUndefined();
    expect(view.adResourceNames).toEqual(['customers/999/adGroupAds/1']);
  });

  it('parses an imported/synced target: external platform, last platform read, objective, and the ads snapshot', () => {
    const view = toAutomationTargetView(
      target({
        id: 'meta_ads_52619',
        external_platform: 'meta_ads',
        last_read_state_at: '2026-08-28T10:00:00.000Z',
        campaign_resource_name: '52619',
        imported_ads_json: JSON.stringify({
          objective: 'OUTCOME_TRAFFIC',
          ads: [{ adName: 'lawyers | va | image ad', headline: 'Sign In Minutes', status: 'PAUSED' }],
        }),
      }),
    );
    expect(view.externalPlatform).toBe('meta_ads');
    expect(view.lastReadStateAt).toBe('2026-08-28T10:00:00.000Z');
    expect(view.importedObjective).toBe('OUTCOME_TRAFFIC');
    expect(view.importedAds).toEqual([{ adName: 'lawyers | va | image ad', headline: 'Sign In Minutes', status: 'PAUSED' }]);
  });

  it('degrades a malformed imported_ads_json to "no imported ads" instead of crashing the page', () => {
    const view = toAutomationTargetView(target({ id: 't5', imported_ads_json: '{not json' }));
    expect(view.importedAds).toBeUndefined();
    expect(view.importedObjective).toBeUndefined();
  });

  it('normalizes the ORM-written epoch updated_at into an ISO timestamp, and leaves an ISO string as-is', () => {
    const epochView = toAutomationTargetView(target({ id: 't7', updated_at: 1787941740032 as unknown as string }));
    expect(epochView.updatedAt).toBe('2026-08-28T18:29:00.032Z');
    const isoView = toAutomationTargetView(target({ id: 't8', last_read_state_at: '2026-08-28T18:29:00.032Z' }));
    expect(isoView.lastReadStateAt).toBe('2026-08-28T18:29:00.032Z');
  });

  it('omits the imported/synced fields entirely for a target that was never imported', () => {
    const view = toAutomationTargetView(target({ id: 't6' }));
    expect(view.externalPlatform).toBeUndefined();
    expect(view.lastReadStateAt).toBeUndefined();
    expect(view.importedAds).toBeUndefined();
  });
});

describe('findCampaignDraftForTarget', () => {
  const draft = { platform: 'google_ads', campaignName: 'Brand', dailyBudgetUsd: 30, adGroups: [] };

  function draftAction(overrides: Partial<AutomationActionModel>): AutomationActionModel {
    return {
      id: 'a1',
      target_id: 't1',
      target_label: 'Summer Sale',
      action_type: 'campaign_draft_create',
      status: 'executed',
      before: {},
      after: { campaignDraft: draft },
      guardrail_violations: [],
      proposed_at: '2026-07-15T00:00:00.000Z',
      ...overrides,
    } as AutomationActionModel;
  }

  it('returns the executed draft for the target', () => {
    expect(findCampaignDraftForTarget([draftAction({})], 't1')).toEqual(draft);
  });

  it('prefers the executed draft over a merely awaiting_approval one', () => {
    const pendingDraft = { ...draft, campaignName: 'Pending Version' };
    const actions = [
      draftAction({ id: 'a2', status: 'awaiting_approval', after: { campaignDraft: pendingDraft } }),
      draftAction({ id: 'a1', status: 'executed' }),
    ];
    expect(findCampaignDraftForTarget(actions, 't1')).toEqual(draft);
  });

  it('falls back to an awaiting_approval draft when nothing executed yet', () => {
    expect(findCampaignDraftForTarget([draftAction({ status: 'awaiting_approval' })], 't1')).toEqual(draft);
  });

  it('ignores other targets, other action types, and blocked/rejected drafts', () => {
    expect(findCampaignDraftForTarget([draftAction({ target_id: 'other' })], 't1')).toBeUndefined();
    expect(findCampaignDraftForTarget([draftAction({ action_type: 'budget_change' })], 't1')).toBeUndefined();
    expect(findCampaignDraftForTarget([draftAction({ status: 'blocked' })], 't1')).toBeUndefined();
  });
});

