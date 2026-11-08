import { describe, expect, it } from 'vitest';
import { GROWTH_MAX_DAILY_BUDGET, GROWTH_MIN_DAILY_BUDGET, isValidGrowthDailyBudget, metaAdAccountNumber, metaAdsManagerUrl } from './live-ads';

describe('isValidGrowthDailyBudget', () => {
  it('accepts a number from the minimum to the maximum, fractions included', () => {
    expect(isValidGrowthDailyBudget(GROWTH_MIN_DAILY_BUDGET)).toBe(true);
    expect(isValidGrowthDailyBudget(35.5)).toBe(true);
    expect(isValidGrowthDailyBudget(GROWTH_MAX_DAILY_BUDGET)).toBe(true);
  });

  it('refuses zero, negatives, too much, and anything that is not a finite number', () => {
    for (const value of [0, 0.5, -5, GROWTH_MAX_DAILY_BUDGET + 1, Number.NaN, Number.POSITIVE_INFINITY, '20', null, undefined]) expect(isValidGrowthDailyBudget(value)).toBe(false);
  });
});

describe('metaAdsManagerUrl', () => {
  it('opens the campaign in Ads Manager, with the account number and no act_ prefix', () => {
    expect(metaAdsManagerUrl({ adAccountId: 'act_123456', campaignId: '238500001' })).toBe('https://adsmanager.facebook.com/adsmanager/manage/ads?act=123456&selected_campaign_ids=238500001');
    expect(metaAdsManagerUrl({ adAccountId: '123456', campaignId: '238500001' })).toBe('https://adsmanager.facebook.com/adsmanager/manage/ads?act=123456&selected_campaign_ids=238500001');
  });

  it('gives no link when an id is missing or not a Meta id', () => {
    expect(metaAdsManagerUrl(null)).toBeNull();
    expect(metaAdsManagerUrl(undefined)).toBeNull();
    expect(metaAdsManagerUrl({ adAccountId: '', campaignId: '1' })).toBeNull();
    expect(metaAdsManagerUrl({ adAccountId: '1', campaignId: '' })).toBeNull();
    expect(metaAdsManagerUrl({ adAccountId: '1', campaignId: '1&evil=1' })).toBeNull();
  });

  it('strips the act_ prefix in any case', () => {
    expect(metaAdAccountNumber(' ACT_42 ')).toBe('42');
    expect(metaAdAccountNumber('42')).toBe('42');
  });
});
