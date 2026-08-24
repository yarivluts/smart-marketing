import { describe, expect, it } from 'vitest';
import { feedbackThemeLabelKey, toNpsDimensionBreakdownRows } from './feedback-view';

describe('feedbackThemeLabelKey', () => {
  it('maps every known theme to its translation key', () => {
    expect(feedbackThemeLabelKey('pricing')).toBe('themePricing');
    expect(feedbackThemeLabelKey('support')).toBe('themeSupport');
    expect(feedbackThemeLabelKey('bugs')).toBe('themeBugs');
    expect(feedbackThemeLabelKey('performance')).toBe('themePerformance');
    expect(feedbackThemeLabelKey('missing_features')).toBe('themeMissingFeatures');
    expect(feedbackThemeLabelKey('onboarding')).toBe('themeOnboarding');
    expect(feedbackThemeLabelKey('usability')).toBe('themeUsability');
  });

  it('falls back to the raw theme name for an unrecognized value', () => {
    expect(feedbackThemeLabelKey('some_future_theme')).toBe('some_future_theme');
  });
});

describe('toNpsDimensionBreakdownRows', () => {
  it('flattens rows into {value, respondents, npsScore}, most respondents first', () => {
    const rows = toNpsDimensionBreakdownRows(
      [
        { plan_interval: 'month', nps_respondents: 5, nps_promoters: 3, nps_detractors: 1 },
        { plan_interval: 'year', nps_respondents: 10, nps_promoters: 8, nps_detractors: 1 },
      ],
      'plan_interval',
    );
    expect(rows).toEqual([
      { value: 'year', respondents: 10, npsScore: 70 },
      { value: 'month', respondents: 5, npsScore: 40 },
    ]);
  });

  it('treats a null dimension value as an empty-string bucket, a null count as zero, and a zero-respondent bucket as a null score', () => {
    const rows = toNpsDimensionBreakdownRows([{ channel_id: null, nps_respondents: null, nps_promoters: null, nps_detractors: null }], 'channel_id');
    expect(rows).toEqual([{ value: '', respondents: 0, npsScore: null }]);
  });

  it('breaks ties on respondents alphabetically by value', () => {
    const rows = toNpsDimensionBreakdownRows(
      [
        { channel_id: 'paid_social', nps_respondents: 4, nps_promoters: 2, nps_detractors: 0 },
        { channel_id: 'paid_search', nps_respondents: 4, nps_promoters: 1, nps_detractors: 1 },
      ],
      'channel_id',
    );
    expect(rows.map((row) => row.value)).toEqual(['paid_search', 'paid_social']);
  });

  it('sums counts across more than one bucket_date row for the same dimension value before deriving the score', () => {
    // The compiler always buckets by its own bucket_date regardless of the requested dimensions, so
    // the same channel can come back split across more than one row (e.g. two different years).
    const rows = toNpsDimensionBreakdownRows(
      [
        { bucket_date: '2026-01-01', channel_id: 'paid_search', nps_respondents: 2, nps_promoters: 2, nps_detractors: 0 },
        { bucket_date: '2027-01-01', channel_id: 'paid_search', nps_respondents: 3, nps_promoters: 0, nps_detractors: 3 },
      ],
      'channel_id',
    );
    // Summed across both buckets: 2 promoters, 3 detractors, 5 respondents -> (2-3)/5*100 = -20.
    expect(rows).toEqual([{ value: 'paid_search', respondents: 5, npsScore: -20 }]);
  });
});
