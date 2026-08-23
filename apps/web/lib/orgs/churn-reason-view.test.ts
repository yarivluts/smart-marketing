import { describe, expect, it } from 'vitest';
import { cancellationReasonCodeLabelKey, cancellationReasonThemeLabelKey, toCancellationReasonDimensionBreakdownRows } from './churn-reason-view';

describe('cancellationReasonThemeLabelKey', () => {
  it('maps every known theme to its translation key', () => {
    expect(cancellationReasonThemeLabelKey('pricing')).toBe('themePricing');
    expect(cancellationReasonThemeLabelKey('competitor')).toBe('themeCompetitor');
    expect(cancellationReasonThemeLabelKey('missing_features')).toBe('themeMissingFeatures');
    expect(cancellationReasonThemeLabelKey('support')).toBe('themeSupport');
    expect(cancellationReasonThemeLabelKey('bugs')).toBe('themeBugs');
    expect(cancellationReasonThemeLabelKey('not_using')).toBe('themeNotUsing');
  });

  it('falls back to the raw theme name for an unrecognized value', () => {
    expect(cancellationReasonThemeLabelKey('some_future_theme')).toBe('some_future_theme');
  });
});

describe('cancellationReasonCodeLabelKey', () => {
  it('maps every taxonomy code to its translation key', () => {
    expect(cancellationReasonCodeLabelKey('too_expensive')).toBe('reasonTooExpensive');
    expect(cancellationReasonCodeLabelKey('missing_features')).toBe('reasonMissingFeatures');
    expect(cancellationReasonCodeLabelKey('switched_competitor')).toBe('reasonSwitchedCompetitor');
    expect(cancellationReasonCodeLabelKey('poor_support')).toBe('reasonPoorSupport');
    expect(cancellationReasonCodeLabelKey('not_using_enough')).toBe('reasonNotUsingEnough');
    expect(cancellationReasonCodeLabelKey('technical_issues')).toBe('reasonTechnicalIssues');
    expect(cancellationReasonCodeLabelKey('other')).toBe('reasonOther');
  });

  it('falls back to the raw code for an unrecognized value', () => {
    expect(cancellationReasonCodeLabelKey('made_up_reason')).toBe('made_up_reason');
  });
});

describe('toCancellationReasonDimensionBreakdownRows', () => {
  it('flattens rows into {value, count}, most cancellations first', () => {
    const rows = toCancellationReasonDimensionBreakdownRows(
      [
        { plan_interval: 'month', cancellations_total: 3 },
        { plan_interval: 'year', cancellations_total: 7 },
      ],
      'plan_interval',
    );
    expect(rows).toEqual([
      { value: 'year', count: 7 },
      { value: 'month', count: 3 },
    ]);
  });

  it('treats a null dimension value as an empty-string bucket and a null count as zero', () => {
    const rows = toCancellationReasonDimensionBreakdownRows([{ channel_id: null, cancellations_total: null }], 'channel_id');
    expect(rows).toEqual([{ value: '', count: 0 }]);
  });

  it('breaks ties on count alphabetically by value', () => {
    const rows = toCancellationReasonDimensionBreakdownRows(
      [
        { channel_id: 'paid_social', cancellations_total: 2 },
        { channel_id: 'paid_search', cancellations_total: 2 },
      ],
      'channel_id',
    );
    expect(rows.map((row) => row.value)).toEqual(['paid_search', 'paid_social']);
  });

  it('sums counts across more than one bucket_date row for the same dimension value', () => {
    // The compiler always buckets by its own bucket_date regardless of the requested dimensions, so
    // the same channel can come back split across more than one row (e.g. two different years).
    const rows = toCancellationReasonDimensionBreakdownRows(
      [
        { bucket_date: '2026-01-01', channel_id: 'paid_search', cancellations_total: 2 },
        { bucket_date: '2027-01-01', channel_id: 'paid_search', cancellations_total: 3 },
      ],
      'channel_id',
    );
    expect(rows).toEqual([{ value: 'paid_search', count: 5 }]);
  });
});
