import { describe, expect, it } from 'vitest';
import type { BoardModel, BoardTile } from '@growthos/firebase-orm-models';
import { buildTileRenderView, computeTileFreshness, TILE_STALE_THRESHOLD_HOURS, toBoardSummaryView, toBoardView } from './board-view';

function board(overrides: Partial<BoardModel> & Pick<BoardModel, 'id'>): BoardModel {
  return {
    name: 'Marketing',
    tiles: [],
    date_range: { start: '2026-01-01', end: '2026-01-07', grain: 'day' },
    compare: undefined,
    global_filters: [],
    updated_at: '2026-01-07T00:00:00.000Z',
    ...overrides,
  } as BoardModel;
}

function tile(overrides: Partial<BoardTile>): BoardTile {
  return {
    id: 't1',
    type: 'big_number',
    title: 'Ad spend',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    metricNames: ['ad_spend'],
    dimensions: [],
    ...overrides,
  };
}

describe('toBoardSummaryView / toBoardView', () => {
  it('maps a board to its list-card summary', () => {
    const view = toBoardSummaryView(board({ id: 'b1', tiles: [tile({})] }));
    expect(view).toEqual({ id: 'b1', name: 'Marketing', tileCount: 1, updatedAt: '2026-01-07T00:00:00.000Z' });
  });

  it('maps a board to its full settings view, omitting compare when unset (a legacy range reads as absolute)', () => {
    const view = toBoardView(board({ id: 'b1' }), '2026-09-26');
    expect(view.compare).toBeUndefined();
    expect(view).toMatchObject({
      id: 'b1',
      name: 'Marketing',
      dateRange: { kind: 'absolute', start: '2026-01-01', end: '2026-01-07', grain: 'day' },
      resolvedDateRange: { start: '2026-01-01', end: '2026-01-07', grain: 'day' },
      globalFilters: [],
    });
  });

  it('resolves a relative range against the given day (KAN-211)', () => {
    const view = toBoardView(board({ id: 'b1', date_range: { kind: 'relative', preset: 'last_7_days', grain: 'day' } }), '2026-09-26');
    expect(view.dateRange).toEqual({ kind: 'relative', preset: 'last_7_days', grain: 'day' });
    expect(view.resolvedDateRange).toEqual({ start: '2026-09-20', end: '2026-09-26', grain: 'day' });
  });

  it('falls back to the rolling default for an unreadable stored range rather than failing the page', () => {
    const view = toBoardView(board({ id: 'b1', date_range: { kind: 'relative', preset: 'bogus', grain: 'day' } as never }), '2026-09-26');
    expect(view.dateRange).toEqual({ kind: 'relative', preset: 'last_30_days', grain: 'day' });
  });

  it('includes compare when set', () => {
    const view = toBoardView(board({ id: 'b1', compare: 'previous_period' }));
    expect(view.compare).toBe('previous_period');
  });
});

describe('buildTileRenderView — unavailable', () => {
  it('passes an unavailable outcome straight through', () => {
    const view = buildTileRenderView(tile({}), { ok: false, reason: 'warehouse_not_configured', message: 'not configured yet' });
    expect(view).toEqual({ kind: 'unavailable', reason: 'warehouse_not_configured', message: 'not configured yet' });
  });
});

describe('buildTileRenderView — metric units (KAN-213)', () => {
  const units = {
    lp_conversion_rate: { kind: 'ratio' as const },
    signups: { kind: 'count' as const },
    plain: { kind: 'number' as const },
  };

  it("attaches only the tile's own metrics' declared units, leaving plain numbers out", () => {
    const view = buildTileRenderView(tile({ type: 'table', metricNames: ['signups', 'plain'] }), { ok: true, series: [{ bucket_date: '2026-01-01', signups: 3, plain: 1 }] }, null, units);
    expect(view).toMatchObject({ kind: 'table', units: { signups: { kind: 'count' } } });
  });

  it('attaches no units at all when none of the tile metrics declares one (display unchanged)', () => {
    const view = buildTileRenderView(tile({ type: 'big_number', metricNames: ['plain'] }), { ok: true, series: [{ bucket_date: '2026-01-01', plain: 1 }] }, null, units);
    expect(view).toEqual({ kind: 'big_number', value: 1, isEmpty: false, freshness: null });
  });

  it('shows a ratio big number as the period value the warehouse computed (2/101 = 1.98%), never a mean of daily rates (50.5%) (B24)', () => {
    // The tile's query is the whole range as one bucket, so the row IS the period: 2 conversions
    // over 101 visitors across day 1 (1/1) and day 2 (1/100).
    const view = buildTileRenderView(
      tile({ type: 'big_number', metricNames: ['lp_conversion_rate'] }),
      { ok: true, series: [{ bucket_date: '2026-09-01', lp_conversion_rate: 2 / 101 }] },
      null,
      units,
    );
    expect(view).toMatchObject({ kind: 'big_number', units: { lp_conversion_rate: { kind: 'ratio' } } });
    const value = view.kind === 'big_number' ? view.value : Number.NaN;
    expect(value).toBeCloseTo(0.0198, 4);
    expect(value).not.toBeCloseTo(0.505, 2);
  });

  it('shows a count big number as the same period total as before', () => {
    const view = buildTileRenderView(tile({ type: 'big_number', metricNames: ['signups'] }), { ok: true, series: [{ bucket_date: '2026-01-01', signups: 5 }] }, null, units);
    expect(view).toMatchObject({ value: 5 });
  });

  it('compares a ratio period against the previous period\'s own value', () => {
    const view = buildTileRenderView(
      tile({ type: 'big_number', metricNames: ['lp_conversion_rate'] }),
      {
        ok: true,
        series: [
          { period: 'current', bucket_date: '2026-09-01', lp_conversion_rate: 0.02 },
          { period: 'previous', bucket_date: '2026-08-30', lp_conversion_rate: 0.04 },
        ],
      },
      null,
      units,
    );
    expect(view).toMatchObject({ kind: 'big_number', value: 0.02, previousValue: 0.04, deltaPct: -50 });
  });
});

describe('buildTileRenderView — big_number', () => {
  it('reads the current period\'s single row, with no previousValue/deltaPct when there is no compare data', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), { ok: true, series: [{ bucket_date: '2026-01-01', ad_spend: 150 }] });
    expect(view).toEqual({ kind: 'big_number', value: 150, isEmpty: false, freshness: null });
  });

  it('shows a current value with no delta when a compared previous period returned nothing', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), { ok: true, series: [{ period: 'current', bucket_date: '2026-01-01', ad_spend: 150 }] });
    expect(view).toEqual({ kind: 'big_number', value: 150, isEmpty: false, freshness: null });
  });

  it('computes a delta percentage against the previous period', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: 150, period: 'current' },
        { bucket_date: '2025-12-01', ad_spend: 100, period: 'previous' },
      ],
    });
    expect(view).toEqual({ kind: 'big_number', value: 150, previousValue: 100, deltaPct: 50, isEmpty: false, freshness: null });
  });

  it('omits deltaPct (division by zero) when the previous period totals zero', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: 150, period: 'current' },
        { bucket_date: '2025-12-01', ad_spend: 0, period: 'previous' },
      ],
    });
    expect(view).toEqual({ kind: 'big_number', value: 150, previousValue: 0, isEmpty: false, freshness: null });
  });

  it('treats a null metric value as zero', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), { ok: true, series: [{ bucket_date: '2026-01-01', ad_spend: null }] });
    expect(view).toEqual({ kind: 'big_number', value: 0, isEmpty: false, freshness: null });
  });

  it('flags isEmpty when the query returned zero rows, distinct from a genuine zero value', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), { ok: true, series: [] });
    expect(view).toEqual({ kind: 'big_number', value: 0, isEmpty: true, freshness: null });
  });

  it('threads a precomputed freshness badge straight through to the render view', () => {
    const freshness = { asOf: '2026-01-01T00:00:00.000Z', isStale: true };
    const view = buildTileRenderView(
      tile({ type: 'big_number' }),
      { ok: true, series: [{ bucket_date: '2026-01-01', ad_spend: 10 }] },
      freshness,
    );
    expect(view).toEqual({ kind: 'big_number', value: 10, isEmpty: false, freshness });
  });
});

describe('buildTileRenderView — time_series', () => {
  it('builds one series when no dimension breakdown is requested, sorted by bucket', () => {
    const view = buildTileRenderView(tile({ type: 'line' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-02', ad_spend: 50 },
        { bucket_date: '2026-01-01', ad_spend: 100 },
      ],
    });
    expect(view).toEqual({
      kind: 'time_series',
      chart: 'line',
      series: [
        {
          label: 'all',
          points: [
            { bucket: '2026-01-01', value: 100 },
            { bucket: '2026-01-02', value: 50 },
          ],
        },
      ],
      isEmpty: false,
      freshness: null,
    });
  });

  it('keeps a null value as a gap (null), not 0, and keeps a filled 0 as a real 0 (KAN-210 follow-up)', () => {
    const view = buildTileRenderView(tile({ type: 'line' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: 10 },
        { bucket_date: '2026-01-02', ad_spend: null },
        { bucket_date: '2026-01-03', ad_spend: 0 },
      ],
    });
    expect(view.kind === 'time_series' && view.series[0].points).toEqual([
      { bucket: '2026-01-01', value: 10 },
      { bucket: '2026-01-02', value: null },
      { bucket: '2026-01-03', value: 0 },
    ]);
    expect(view.kind === 'time_series' && view.isEmpty).toBe(false);
  });

  it('flags a series of nothing but gaps as empty - there is nothing to draw', () => {
    const view = buildTileRenderView(tile({ type: 'bar' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: null },
        { bucket_date: '2026-01-02', ad_spend: null },
      ],
    });
    expect(view.kind === 'time_series' && view.isEmpty).toBe(true);
  });

  it('flags isEmpty when the query returned zero rows', () => {
    const view = buildTileRenderView(tile({ type: 'line' }), { ok: true, series: [] });
    expect(view).toEqual({ kind: 'time_series', chart: 'line', series: [], isEmpty: true, freshness: null });
  });

  it('groups into one series per dimension value, and includes a previousSeries when compare rows are present', () => {
    const view = buildTileRenderView(tile({ type: 'bar', dimensions: ['channel'] }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', channel: 'google', ad_spend: 100, period: 'current' },
        { bucket_date: '2026-01-01', channel: 'meta', ad_spend: 60, period: 'current' },
        { bucket_date: '2025-12-01', channel: 'google', ad_spend: 80, period: 'previous' },
      ],
    });
    expect(view.kind).toBe('time_series');
    expect(view).toMatchObject({
      chart: 'bar',
      series: [
        { label: 'google', points: [{ bucket: '2026-01-01', value: 100 }] },
        { label: 'meta', points: [{ bucket: '2026-01-01', value: 60 }] },
      ],
      previousSeries: [{ label: 'google', points: [{ bucket: '2025-12-01', value: 80 }] }],
    });
  });

  it('does not merge two genuinely different dimension-value combinations whose display labels collide on the join delimiter', () => {
    // Two-dimension breakdown where one combination's own values, joined by
    // ' / ', looks identical to a different combination's join — a naive
    // string-concatenation grouping key would wrongly merge these into one
    // series (2 + 3 = 5, corrupting both series' real point counts of 1 each).
    const view = buildTileRenderView(tile({ type: 'bar', dimensions: ['channel', 'campaign'] }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', channel: 'A', campaign: 'B / C', ad_spend: 2 },
        { bucket_date: '2026-01-01', channel: 'A / B', campaign: 'C', ad_spend: 3 },
      ],
    });
    expect(view.kind).toBe('time_series');
    expect(view.kind === 'time_series' && view.series).toHaveLength(2);
    expect(view.kind === 'time_series' && view.series.every((series) => series.points.length === 1)).toBe(true);
  });
});

describe('buildTileRenderView — table', () => {
  it('sorts rows by bucket then period and unions every column present', () => {
    const view = buildTileRenderView(tile({ type: 'table' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-02', ad_spend: 50 },
        { bucket_date: '2026-01-01', ad_spend: 100, channel: 'google' },
      ],
    });
    expect(view.kind).toBe('table');
    expect(view).toMatchObject({
      columns: expect.arrayContaining(['bucket_date', 'ad_spend', 'channel']),
      rows: [
        { bucket_date: '2026-01-01', ad_spend: 100, channel: 'google' },
        { bucket_date: '2026-01-02', ad_spend: 50 },
      ],
      isEmpty: false,
      freshness: null,
    });
  });

  it('flags isEmpty when the query returned zero rows', () => {
    const view = buildTileRenderView(tile({ type: 'table' }), { ok: true, series: [] });
    expect(view).toEqual({ kind: 'table', columns: [], rows: [], isEmpty: true, freshness: null });
  });
});

describe('buildTileRenderView — funnel', () => {
  it('reads each step\'s period value off the single whole-range row and computes its percentage of the first step', () => {
    const view = buildTileRenderView(tile({ type: 'funnel', metricNames: ['signups', 'activations', 'purchases'], dimensions: [] }), {
      ok: true,
      series: [{ bucket_date: '2026-01-01', signups: 150, activations: 60, purchases: 15 }],
    });
    expect(view).toEqual({
      kind: 'funnel',
      steps: [
        { metricName: 'signups', total: 150, pctOfFirstStep: 100 },
        { metricName: 'activations', total: 60, pctOfFirstStep: 40 },
        { metricName: 'purchases', total: 15, pctOfFirstStep: 10 },
      ],
      isEmpty: false,
      freshness: null,
    });
  });

  it('reports 0% for every step when the first step totals zero', () => {
    const view = buildTileRenderView(tile({ type: 'funnel', metricNames: ['signups', 'purchases'], dimensions: [] }), {
      ok: true,
      series: [{ bucket_date: '2026-01-01', signups: 0, purchases: 0 }],
    });
    expect(view).toEqual({
      kind: 'funnel',
      steps: [
        { metricName: 'signups', total: 0, pctOfFirstStep: 0 },
        { metricName: 'purchases', total: 0, pctOfFirstStep: 0 },
      ],
      isEmpty: false,
      freshness: null,
    });
  });

  it('flags isEmpty when the query returned zero rows, distinct from every step totaling zero', () => {
    const view = buildTileRenderView(tile({ type: 'funnel', metricNames: ['signups', 'purchases'], dimensions: [] }), {
      ok: true,
      series: [],
    });
    expect(view).toEqual({
      kind: 'funnel',
      steps: [
        { metricName: 'signups', total: 0, pctOfFirstStep: 0 },
        { metricName: 'purchases', total: 0, pctOfFirstStep: 0 },
      ],
      isEmpty: true,
      freshness: null,
    });
  });
});

describe('buildTileRenderView — heatmap', () => {
  it('builds a cohort_month x dimension matrix, numeric-sorting the dimension column labels', () => {
    const view = buildTileRenderView(tile({ type: 'heatmap', metricNames: ['retention_rate'], dimensions: ['period_number'] }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', period_number: '0', retention_rate: 1 },
        { bucket_date: '2026-01-01', period_number: '10', retention_rate: 0.2 },
        { bucket_date: '2026-01-01', period_number: '2', retention_rate: 0.5 },
        { bucket_date: '2026-02-01', period_number: '0', retention_rate: 1 },
      ],
    });
    expect(view).toEqual({
      kind: 'heatmap',
      rowLabels: ['2026-01-01', '2026-02-01'],
      columnLabels: ['0', '2', '10'],
      matrix: [
        [1, 0.5, 0.2],
        [1, null, null],
      ],
      isEmpty: false,
      freshness: null,
    });
  });

  it('renders null (not zero) for a cohort x period combination absent from the series', () => {
    const view = buildTileRenderView(tile({ type: 'heatmap', metricNames: ['retention_rate'], dimensions: ['period_number'] }), {
      ok: true,
      series: [{ bucket_date: '2026-01-01', period_number: '0', retention_rate: 1 }],
    });
    expect(view).toEqual({ kind: 'heatmap', rowLabels: ['2026-01-01'], columnLabels: ['0'], matrix: [[1]], isEmpty: false, freshness: null });
  });

  it('returns an empty matrix for no rows, flagged isEmpty', () => {
    const view = buildTileRenderView(tile({ type: 'heatmap', metricNames: ['retention_rate'], dimensions: ['period_number'] }), { ok: true, series: [] });
    expect(view).toEqual({ kind: 'heatmap', rowLabels: [], columnLabels: [], matrix: [], isEmpty: true, freshness: null });
  });
});

describe('buildTileRenderView — histogram', () => {
  it('builds a one-dimension bar series, numeric-sorting the dimension labels', () => {
    const view = buildTileRenderView(
      tile({ type: 'histogram', metricNames: ['engagement_depth_histogram'], dimensions: ['days_active_bucket'] }),
      {
        ok: true,
        series: [
          { bucket_date: '2026-04-28', days_active_bucket: '10', engagement_depth_histogram: 1 },
          { bucket_date: '2026-04-28', days_active_bucket: '1', engagement_depth_histogram: 1 },
          { bucket_date: '2026-04-28', days_active_bucket: '3', engagement_depth_histogram: 0 },
        ],
      },
    );
    expect(view).toEqual({ kind: 'histogram', labels: ['1', '3', '10'], values: [1, 0, 1], isEmpty: false, freshness: null });
  });

  it('sums more than one row sharing the same dimension value, rather than overwriting', () => {
    const view = buildTileRenderView(
      tile({ type: 'histogram', metricNames: ['engagement_depth_histogram'], dimensions: ['days_active_bucket'] }),
      {
        ok: true,
        series: [
          { bucket_date: '2026-04-28', days_active_bucket: '1', engagement_depth_histogram: 2 },
          { bucket_date: '2026-04-27', days_active_bucket: '1', engagement_depth_histogram: 3 },
        ],
      },
    );
    expect(view).toEqual({ kind: 'histogram', labels: ['1'], values: [5], isEmpty: false, freshness: null });
  });

  it('returns an empty series for no rows, flagged isEmpty', () => {
    const view = buildTileRenderView(
      tile({ type: 'histogram', metricNames: ['engagement_depth_histogram'], dimensions: ['days_active_bucket'] }),
      { ok: true, series: [] },
    );
    expect(view).toEqual({ kind: 'histogram', labels: [], values: [], isEmpty: true, freshness: null });
  });
});

describe('computeTileFreshness', () => {
  it('returns null when there is no known "as of" timestamp yet', () => {
    expect(computeTileFreshness(null)).toBeNull();
  });

  it('marks data fresh when it is younger than the stale threshold', () => {
    const nowMs = new Date('2026-07-12T12:00:00.000Z').getTime();
    const asOf = new Date(nowMs - (TILE_STALE_THRESHOLD_HOURS - 1) * 60 * 60 * 1000).toISOString();
    expect(computeTileFreshness(asOf, nowMs)).toEqual({ asOf, isStale: false });
  });

  it('marks data stale once it is at least the stale threshold old', () => {
    const nowMs = new Date('2026-07-12T12:00:00.000Z').getTime();
    const asOf = new Date(nowMs - TILE_STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
    expect(computeTileFreshness(asOf, nowMs)).toEqual({ asOf, isStale: true });
  });

  it('marks data far in the past as stale', () => {
    const nowMs = new Date('2026-07-12T12:00:00.000Z').getTime();
    const asOf = '2026-01-01T00:00:00.000Z';
    expect(computeTileFreshness(asOf, nowMs)).toEqual({ asOf, isStale: true });
  });
});

/**
 * The reported symptom on the Landing-page board: the big-number and breakdown tiles came up
 * as blank boxes while the table tile, fed the identical rows, rendered them correctly.
 *
 * `isEmpty` was `outcome.series.length === 0` - the raw row count - but every chart kind
 * draws from a subset. `buildTimeSeriesView` splits by `period` and charts only the current
 * one, so rows that are all `period: 'previous'` yield `series: []` while the row count says
 * "not empty". The chart components then skip their empty branch and render an `<svg>` with
 * no polylines, with nothing to tell the user why.
 */
/**
 * `TileRenderView` includes the `unavailable` member, which carries no `isEmpty`, so reading
 * that field off the union does not typecheck. These cases always pass `ok: true`, so the
 * view is never `unavailable` - this narrows once and fails loudly if that ever stops holding.
 */
function drawable(view: ReturnType<typeof buildTileRenderView>) {
  if (view.kind === 'unavailable') {
    throw new Error(`expected a drawable tile, got unavailable: ${view.message}`);
  }
  return view;
}

describe('buildTileRenderView - isEmpty reflects what can actually be drawn', () => {
  const previousOnlyRows = [
    { bucket_date: '2026-01-01', period: 'previous', ad_spend: 10 },
    { bucket_date: '2026-01-02', period: 'previous', ad_spend: 12 },
  ];

  it('flags a chart whose rows are all from the previous period as empty', () => {
    for (const type of ['line', 'bar'] as const) {
      const view = drawable(buildTileRenderView(tile({ type }), { ok: true, series: previousOnlyRows }));
      expect({ type, isEmpty: view.isEmpty }).toEqual({ type, isEmpty: true });
      // The blank box came from this combination: nothing to draw, but not flagged empty.
      expect(view.kind === 'time_series' && view.series).toEqual([]);
    }
  });

  it('flags a big number with no current-period rows as empty rather than a genuine zero', () => {
    const view = drawable(buildTileRenderView(tile({ type: 'big_number' }), { ok: true, series: previousOnlyRows }));
    expect(view.isEmpty).toBe(true);
    // Summing zero rows gives 0; that 0 must not read as a metric that genuinely measured zero.
    expect(view.kind === 'big_number' && view.value).toBe(0);
  });

  it('does not flag a chart that has real current-period points', () => {
    const view = drawable(buildTileRenderView(tile({ type: 'bar' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', period: 'current', ad_spend: 4 },
        ...previousOnlyRows,
      ],
    }));
    expect(view.isEmpty).toBe(false);
  });

  it('treats a genuine zero in the current period as present, not empty', () => {
    const view = drawable(
      buildTileRenderView(tile({ type: 'big_number' }), {
        ok: true,
        series: [{ bucket_date: '2026-01-01', period: 'current', ad_spend: 0 }],
      }),
    );
    expect(view.isEmpty).toBe(false);
    expect(view.kind === 'big_number' && view.value).toBe(0);
  });

  it('still flags a table with no rows, and a funnel whose steps come from config', () => {
    expect(drawable(buildTileRenderView(tile({ type: 'table' }), { ok: true, series: [] })).isEmpty).toBe(true);
    // A funnel emits one step per configured metric, so step count can never signal emptiness.
    const funnel = drawable(buildTileRenderView(tile({ type: 'funnel', metricNames: ['a', 'b'] }), { ok: true, series: [] }));
    expect(funnel.isEmpty).toBe(true);
    expect(funnel.kind === 'funnel' && funnel.steps).toHaveLength(2);
  });
});
