import { describe, expect, it } from 'vitest';
import type { QualityMixAlertModel } from '@growthos/firebase-orm-models';
import { qualityMixAlertStatusLabelKey, signupQualityScoreTierLabelKey, toQualityMixAlertView, toSignupQualityScoreDimensionBreakdownRows } from './quality-score-view';

describe('signupQualityScoreTierLabelKey', () => {
  it('maps every known tier to its translation key', () => {
    expect(signupQualityScoreTierLabelKey('low')).toBe('tierLow');
    expect(signupQualityScoreTierLabelKey('medium')).toBe('tierMedium');
    expect(signupQualityScoreTierLabelKey('high')).toBe('tierHigh');
  });
});

describe('toSignupQualityScoreDimensionBreakdownRows', () => {
  it('flattens rows into {value, averageScore, sampleSize}, highest average first', () => {
    const rows = toSignupQualityScoreDimensionBreakdownRows(
      [
        { channel_id: 'paid_search', signup_quality_score_sum: 300, signups_scored: 5 },
        { channel_id: 'organic', signup_quality_score_sum: 400, signups_scored: 5 },
      ],
      'channel_id',
    );
    expect(rows).toEqual([
      { value: 'organic', averageScore: 80, sampleSize: 5 },
      { value: 'paid_search', averageScore: 60, sampleSize: 5 },
    ]);
  });

  it('treats a null dimension value as an empty-string bucket, a null sum/count as zero, and reports a null average with zero samples', () => {
    const rows = toSignupQualityScoreDimensionBreakdownRows([{ channel_id: null, signup_quality_score_sum: null, signups_scored: null }], 'channel_id');
    expect(rows).toEqual([{ value: '', averageScore: null, sampleSize: 0 }]);
  });

  it('sums both series across more than one bucket_date row for the same dimension value before dividing once at the end', () => {
    // Averaging each bucket's own average and summing those would be wrong (e.g. (100+0)/2 = 50 vs the
    // true combined average here of 20) -- this asserts the sum-then-divide-once behavior specifically.
    const rows = toSignupQualityScoreDimensionBreakdownRows(
      [
        { bucket_date: '2026-01-01', channel_id: 'paid_search', signup_quality_score_sum: 100, signups_scored: 1 },
        { bucket_date: '2027-01-01', channel_id: 'paid_search', signup_quality_score_sum: 0, signups_scored: 4 },
      ],
      'channel_id',
    );
    expect(rows).toEqual([{ value: 'paid_search', averageScore: 20, sampleSize: 5 }]);
  });

  it('breaks ties on average score by sample size, then alphabetically by value', () => {
    const rows = toSignupQualityScoreDimensionBreakdownRows(
      [
        { channel_id: 'paid_social', signup_quality_score_sum: 50, signups_scored: 1 },
        { channel_id: 'paid_search', signup_quality_score_sum: 250, signups_scored: 5 },
        { channel_id: 'organic', signup_quality_score_sum: 50, signups_scored: 1 },
      ],
      'channel_id',
    );
    // paid_search and paid_social/organic all average 50, but paid_search has the larger sample.
    expect(rows.map((row) => row.value)).toEqual(['paid_search', 'organic', 'paid_social']);
  });
});

describe('qualityMixAlertStatusLabelKey', () => {
  it('maps every known status to its translation key', () => {
    expect(qualityMixAlertStatusLabelKey('active')).toBe('mixAlertStatusActive');
    expect(qualityMixAlertStatusLabelKey('resolved')).toBe('mixAlertStatusResolved');
  });
});

describe('toQualityMixAlertView', () => {
  it('projects a QualityMixAlertModel into a plain, serializable view', () => {
    const alert = {
      id: 'alert-1',
      channel_id: 'paid_social',
      status: 'active',
      detected_at: '2026-09-15T00:00:00.000Z',
      baseline_avg_score: 80,
      current_avg_score: 50,
      delta: 30,
      last_checked_at: '2026-09-15T00:00:00.000Z',
      resolved_at: undefined,
    } as unknown as QualityMixAlertModel;

    expect(toQualityMixAlertView(alert)).toEqual({
      id: 'alert-1',
      channelId: 'paid_social',
      status: 'active',
      detectedAt: '2026-09-15T00:00:00.000Z',
      baselineAvgScore: 80,
      currentAvgScore: 50,
      delta: 30,
      lastCheckedAt: '2026-09-15T00:00:00.000Z',
      resolvedAt: null,
    });
  });
});
