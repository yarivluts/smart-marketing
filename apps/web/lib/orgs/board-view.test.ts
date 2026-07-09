import { describe, expect, it } from 'vitest';
import type { BoardModel, BoardTile } from '@growthos/firebase-orm-models';
import { buildTileRenderView, toBoardSummaryView, toBoardView } from './board-view';

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

  it('maps a board to its full settings view, omitting compare when unset', () => {
    const view = toBoardView(board({ id: 'b1' }));
    expect(view.compare).toBeUndefined();
    expect(view).toMatchObject({ id: 'b1', name: 'Marketing', dateRange: { start: '2026-01-01', end: '2026-01-07', grain: 'day' }, globalFilters: [] });
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

describe('buildTileRenderView — big_number', () => {
  it('sums the current period, with no previousValue/deltaPct when there is no compare data', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: 100 },
        { bucket_date: '2026-01-02', ad_spend: 50 },
      ],
    });
    expect(view).toEqual({ kind: 'big_number', value: 150 });
  });

  it('computes a delta percentage against the previous period', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: 150, period: 'current' },
        { bucket_date: '2025-12-01', ad_spend: 100, period: 'previous' },
      ],
    });
    expect(view).toEqual({ kind: 'big_number', value: 150, previousValue: 100, deltaPct: 50 });
  });

  it('omits deltaPct (division by zero) when the previous period totals zero', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', ad_spend: 150, period: 'current' },
        { bucket_date: '2025-12-01', ad_spend: 0, period: 'previous' },
      ],
    });
    expect(view).toEqual({ kind: 'big_number', value: 150, previousValue: 0 });
  });

  it('treats a null metric value as zero', () => {
    const view = buildTileRenderView(tile({ type: 'big_number' }), { ok: true, series: [{ bucket_date: '2026-01-01', ad_spend: null }] });
    expect(view).toEqual({ kind: 'big_number', value: 0 });
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
    });
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
    });
  });
});

describe('buildTileRenderView — funnel', () => {
  it('sums each step across every row and computes its percentage of the first step', () => {
    const view = buildTileRenderView(tile({ type: 'funnel', metricNames: ['signups', 'activations', 'purchases'], dimensions: [] }), {
      ok: true,
      series: [
        { bucket_date: '2026-01-01', signups: 100, activations: 40, purchases: 10 },
        { bucket_date: '2026-01-02', signups: 50, activations: 20, purchases: 5 },
      ],
    });
    expect(view).toEqual({
      kind: 'funnel',
      steps: [
        { metricName: 'signups', total: 150, pctOfFirstStep: 100 },
        { metricName: 'activations', total: 60, pctOfFirstStep: 40 },
        { metricName: 'purchases', total: 15, pctOfFirstStep: 10 },
      ],
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
    });
  });
});
