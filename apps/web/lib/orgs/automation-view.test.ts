import { describe, expect, it } from 'vitest';
import type { AutomationActionModel } from '@growthos/firebase-orm-models';
import { toAutomationActionView } from './automation-view';

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
});
