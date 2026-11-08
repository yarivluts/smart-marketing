import { describe, expect, it } from 'vitest';
import { toGrowthActivityView, toGrowthProposalView, toGrowthTargetView } from './view';

const ROW = { id: 't1', kind: 'service' as const, name: 'Pro', description: '', audience: '', status: 'active' as const, origin: 'site' as const };

describe('Growth Pilot views of live ads', () => {
  it('carries the budget, its currency and the Ads Manager link of a published target', () => {
    const view = toGrowthTargetView({ ...ROW, publish_status: 'running', daily_budget: 35, budget_currency: 'ILS', meta_refs: { ad_account_id: '99', campaign_id: '2385' } });
    expect(view).toMatchObject({ dailyBudget: 35, budgetCurrency: 'ILS', adsManagerUrl: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=99&selected_campaign_ids=2385' });
  });

  it('has none of them before publishing, or for ads published before they were kept', () => {
    expect(toGrowthTargetView(ROW)).toMatchObject({ dailyBudget: null, budgetCurrency: null, adsManagerUrl: null });
  });

  it('marks an audience for live ads, and keeps the activity detail', () => {
    const proposal = toGrowthProposalView({ id: 'p', kind: 'audience', status: 'pending', change_requests: [], created_on: '', applies_to_live: true });
    expect(proposal.appliesToLive).toBe(true);
    expect(toGrowthProposalView({ id: 'p', kind: 'audience', status: 'pending', change_requests: [], created_on: '' }).appliesToLive).toBe(false);
    expect(toGrowthActivityView({ id: 'a', kind: 'budget_changed', actor: 'u', count: 45, detail: 'USD', created_on: '' })).toMatchObject({ count: 45, detail: 'USD', byPilot: false });
  });
});
