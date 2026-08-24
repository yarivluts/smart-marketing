import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BoardTileView } from './board-tile-view';
import type { BoardTileRow } from './board-types';
import messages from '../../messages/en.json';
import type { TileRenderView } from '@/lib/orgs/board-view';

beforeEach(() => {
  window.localStorage.clear();
});

function tile(overrides: Partial<BoardTileRow> = {}): BoardTileRow {
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

function renderTile(view: TileRenderView, overrides: Partial<BoardTileRow> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardTileView tile={tile(overrides)} view={view} />
    </NextIntlClientProvider>,
  );
}

describe('BoardTileView', () => {
  it('renders an unavailable tile with a translated reason', () => {
    renderTile({ kind: 'unavailable', reason: 'warehouse_not_configured', message: 'not configured yet' });
    expect(screen.getByText('Warehouse not configured yet')).toBeInTheDocument();
    expect(screen.getByText('not configured yet')).toBeInTheDocument();
  });

  it('renders a big_number tile with a delta', () => {
    renderTile({ kind: 'big_number', value: 150, previousValue: 100, deltaPct: 50, isEmpty: false, freshness: null });
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('50% vs. previous')).toBeInTheDocument();
  });

  it('renders an empty big_number state instead of a misleading zero', () => {
    renderTile({ kind: 'big_number', value: 0, isEmpty: true, freshness: null });
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a time_series line tile with a legend for more than one series', () => {
    renderTile(
      {
        kind: 'time_series',
        chart: 'line',
        series: [
          { label: 'google', points: [{ bucket: '2026-01-01', value: 10 }] },
          { label: 'meta', points: [{ bucket: '2026-01-01', value: 5 }] },
        ],
        isEmpty: false,
        freshness: null,
      },
      { type: 'line' },
    );
    expect(screen.getByText('google')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
  });

  it('renders an empty line-chart state', () => {
    renderTile({ kind: 'time_series', chart: 'line', series: [], isEmpty: true, freshness: null }, { type: 'line' });
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
  });

  it('renders a time_series bar tile', () => {
    renderTile(
      { kind: 'time_series', chart: 'bar', series: [{ label: 'all', points: [{ bucket: '2026-01-01', value: 10 }] }], isEmpty: false, freshness: null },
      { type: 'bar' },
    );
    expect(screen.getByRole('img', { name: 'all' })).toBeInTheDocument();
  });

  it('renders an empty bar-chart state', () => {
    renderTile({ kind: 'time_series', chart: 'bar', series: [], isEmpty: true, freshness: null }, { type: 'bar' });
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
  });

  it('colors a solid current-period line and its dashed previous-period counterpart identically, matched by label rather than array index', () => {
    const { container } = renderTile(
      {
        kind: 'time_series',
        chart: 'line',
        // Current period has two channels; previous period only has one of
        // them ("meta" is new this period) — if colors were assigned by
        // each array's own independent index, "meta" (current, index 1)
        // and "google" (previous, index 0) would wrongly share a color.
        series: [
          { label: 'google', points: [{ bucket: '2026-01-01', value: 10 }] },
          { label: 'meta', points: [{ bucket: '2026-01-01', value: 5 }] },
        ],
        previousSeries: [{ label: 'google', points: [{ bucket: '2025-12-01', value: 8 }] }],
        isEmpty: false,
        freshness: null,
      },
      { type: 'line' },
    );
    // Render order (see LineChartView): every `previousSeries` polyline
    // first (dashed), then every `view.series` polyline (solid), each in
    // their own array order — so with one previousSeries entry ("google")
    // and two current series ("google" then "meta"), the DOM order is
    // [dashed google, solid google, solid meta].
    const [dashedGoogle, solidGoogle, solidMeta] = container.querySelectorAll('polyline');
    expect(dashedGoogle.getAttribute('stroke')).toBe(solidGoogle.getAttribute('stroke'));
    expect(dashedGoogle.getAttribute('stroke')).not.toBe(solidMeta.getAttribute('stroke'));
  });

  it('renders a muted previous-period bar row beneath a matching current-period series, with a translated tooltip', () => {
    renderTile(
      {
        kind: 'time_series',
        chart: 'bar',
        series: [{ label: 'all', points: [{ bucket: '2026-01-01', value: 10 }] }],
        previousSeries: [{ label: 'all', points: [{ bucket: '2025-12-01', value: 8 }] }],
        isEmpty: false,
        freshness: null,
      },
      { type: 'bar' },
    );
    expect(screen.getByText('Previous period')).toBeInTheDocument();
    expect(screen.getByTitle('2025-12-01: 8')).toBeInTheDocument();
  });

  it('renders a table tile', () => {
    renderTile(
      { kind: 'table', columns: ['bucket_date', 'ad_spend'], rows: [{ bucket_date: '2026-01-01', ad_spend: 100 }], isEmpty: false, freshness: null },
      { type: 'table' },
    );
    expect(screen.getByRole('button', { name: 'Sort by bucket_date' })).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders an empty table state', () => {
    renderTile({ kind: 'table', columns: [], rows: [], isEmpty: true, freshness: null }, { type: 'table' });
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
  });

  it('renders a heatmap tile as a row/column matrix, with a translated tooltip and an em-dash for missing cells', () => {
    renderTile(
      {
        kind: 'heatmap',
        rowLabels: ['2026-01-01', '2026-02-01'],
        columnLabels: ['0', '1'],
        matrix: [
          [1, 0.5],
          [1, null],
        ],
        isEmpty: false,
        freshness: null,
      },
      { type: 'heatmap', dimensions: ['period_number'] },
    );
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
    expect(screen.getByTitle('2026-01-01 · 1: 0.5')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('renders an empty heatmap state', () => {
    renderTile({ kind: 'heatmap', rowLabels: [], columnLabels: [], matrix: [], isEmpty: true, freshness: null }, { type: 'heatmap' });
    expect(screen.getByText('No cohort data for this range yet.')).toBeInTheDocument();
  });

  it('renders a histogram tile as one bar per bucket label, with a translated tooltip', () => {
    renderTile(
      { kind: 'histogram', labels: ['1', '3', '10'], values: [1, 0, 2], isEmpty: false, freshness: null },
      { type: 'histogram', dimensions: ['days_active_bucket'] },
    );
    expect(screen.getByRole('img', { name: 'Histogram' })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByTitle('1: 1')).toBeInTheDocument();
    expect(screen.getByTitle('10: 2')).toBeInTheDocument();
  });

  it('renders an empty histogram state', () => {
    renderTile({ kind: 'histogram', labels: [], values: [], isEmpty: true, freshness: null }, { type: 'histogram' });
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
  });

  it('renders a funnel tile with each step and its percentage of the first step', () => {
    renderTile(
      {
        kind: 'funnel',
        steps: [
          { metricName: 'signups', total: 100, pctOfFirstStep: 100 },
          { metricName: 'purchases', total: 25, pctOfFirstStep: 25 },
        ],
        isEmpty: false,
        freshness: null,
      },
      { type: 'funnel', metricNames: ['signups', 'purchases'] },
    );
    expect(screen.getByText('signups')).toBeInTheDocument();
    expect(screen.getByText('25 (25%)')).toBeInTheDocument();
  });

  it('renders an empty funnel state instead of misleading 0% steps', () => {
    renderTile(
      { kind: 'funnel', steps: [{ metricName: 'signups', total: 0, pctOfFirstStep: 0 }], isEmpty: true, freshness: null },
      { type: 'funnel', metricNames: ['signups'] },
    );
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
    expect(screen.queryByText('signups')).not.toBeInTheDocument();
  });

  describe('freshness badge', () => {
    it('shows no badge when freshness is unknown', () => {
      renderTile({ kind: 'big_number', value: 10, isEmpty: false, freshness: null });
      expect(screen.queryByText(/Data as of/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
    });

    it('shows a fresh badge when data is within the stale threshold', () => {
      renderTile({ kind: 'big_number', value: 10, isEmpty: false, freshness: { asOf: '2026-07-12T00:00:00.000Z', isStale: false } });
      expect(screen.getByText('Data as of 2026-07-12T00:00:00.000Z')).toBeInTheDocument();
    });

    it('shows a stale badge when data is past the stale threshold', () => {
      renderTile({ kind: 'big_number', value: 10, isEmpty: false, freshness: { asOf: '2026-01-01T00:00:00.000Z', isStale: true } });
      expect(screen.getByText('Stale — data as of 2026-01-01T00:00:00.000Z')).toBeInTheDocument();
    });

    it('shows no badge on an unavailable tile, which has no queried data to attach one to', () => {
      renderTile({ kind: 'unavailable', reason: 'query_error', message: 'boom' });
      expect(screen.queryByText(/Data as of/)).not.toBeInTheDocument();
    });
  });
});

describe('BoardTileView table column sort/show-hide (KAN-85)', () => {
  const MULTI_ROW_VIEW: TileRenderView = {
    kind: 'table',
    isEmpty: false,
    columns: ['campaign_id', 'ad_spend'],
    rows: [
      { campaign_id: 'summer_search', ad_spend: 300 },
      { campaign_id: 'winter_social', ad_spend: 100 },
      { campaign_id: 'spring_display', ad_spend: 200 },
    ],
    freshness: null,
  } as unknown as TileRenderView;

  /**
   * The rendered `ad_spend` cell of every body row, in DOM order — locates
   * the column by its current header position rather than a hard-coded
   * index, since a show/hide test can leave `ad_spend` as the only (index 0)
   * visible column instead of the fixture's original second position.
   */
  function renderedAdSpendOrder(): string[] {
    const adSpendIndex = screen.getAllByRole('columnheader').findIndex((cell) => cell.textContent?.includes('ad_spend'));
    return screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[adSpendIndex]?.textContent ?? '');
  }

  it('sorts rows ascending on first header click, descending on a second click of the same column', () => {
    renderTile(MULTI_ROW_VIEW, { id: 'sort-tile', type: 'table' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort by ad_spend' }));
    expect(renderedAdSpendOrder()).toEqual(['100', '200', '300']);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by ad_spend' }));
    expect(renderedAdSpendOrder()).toEqual(['300', '200', '100']);
  });

  it('resets to ascending when switching the sort to a different column', () => {
    renderTile(MULTI_ROW_VIEW, { id: 'switch-sort-tile', type: 'table' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort by ad_spend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by ad_spend' })); // now descending
    fireEvent.click(screen.getByRole('button', { name: 'Sort by campaign_id' }));
    expect(renderedAdSpendOrder()).toEqual(['200', '300', '100']); // spring_display, summer_search, winter_social
  });

  it('hides a column via the columns menu without dropping any rows', () => {
    renderTile(MULTI_ROW_VIEW, { id: 'hide-tile', type: 'table' });
    expect(screen.getByRole('button', { name: 'Sort by campaign_id' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show campaign_id'));
    expect(screen.queryByRole('button', { name: 'Sort by campaign_id' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 body rows still present
  });

  it('never hides every column — the safety net keeps them all visible once none would remain', () => {
    renderTile(MULTI_ROW_VIEW, { id: 'hide-all-tile', type: 'table' });
    fireEvent.click(screen.getByLabelText('Show campaign_id'));
    fireEvent.click(screen.getByLabelText('Show ad_spend'));
    expect(screen.getByRole('button', { name: 'Sort by campaign_id' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by ad_spend' })).toBeInTheDocument();
  });

  it('persists sort and hidden-column choices per tile id across a remount', () => {
    const { unmount } = renderTile(MULTI_ROW_VIEW, { id: 'persist-tile', type: 'table' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort by ad_spend' }));
    fireEvent.click(screen.getByLabelText('Show campaign_id'));
    unmount();

    renderTile(MULTI_ROW_VIEW, { id: 'persist-tile', type: 'table' });
    expect(screen.queryByRole('button', { name: 'Sort by campaign_id' })).not.toBeInTheDocument();
    expect(renderedAdSpendOrder()).toEqual(['100', '200', '300']);
  });

  it('does not carry one tile’s preferences over to a different tile id', () => {
    const { unmount } = renderTile(MULTI_ROW_VIEW, { id: 'tile-a', type: 'table' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort by ad_spend' }));
    unmount();

    renderTile(MULTI_ROW_VIEW, { id: 'tile-b', type: 'table' });
    expect(renderedAdSpendOrder()).toEqual(['300', '100', '200']);
  });

  it('falls back to unsorted, all-columns-visible defaults when localStorage holds a corrupt value', () => {
    window.localStorage.setItem('growthos-board-tile-corrupt-tile-table-prefs', '{not json');
    renderTile(MULTI_ROW_VIEW, { id: 'corrupt-tile', type: 'table' });
    expect(renderedAdSpendOrder()).toEqual(['300', '100', '200']);
    expect(screen.getByRole('button', { name: 'Sort by campaign_id' })).toBeInTheDocument();
  });

  it('does not render a columns menu for a single-column table', () => {
    renderTile(
      { kind: 'table', columns: ['ad_spend'], rows: [{ ad_spend: 100 }], isEmpty: false, freshness: null },
      { id: 'single-column-tile', type: 'table' },
    );
    expect(screen.queryByText('Columns')).not.toBeInTheDocument();
  });
});

describe('BoardTileView landing-page session-replay links', () => {
  const LP_VIEW: TileRenderView = {
    kind: 'table',
    isEmpty: false,
    columns: ['landing_page', 'campaign_id', 'lp_conversion_rate'],
    rows: [{ landing_page: 'https://example.com/lp-a', campaign_id: 'summer_search', lp_conversion_rate: '0.66' }],
    freshness: undefined,
  } as unknown as TileRenderView;

  function renderLpTable(sessionReplayUrlTemplate?: string) {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardTileView
          tile={tile({ type: 'table', metricNames: ['lp_conversion_rate'], dimensions: ['landing_page', 'campaign_id'] })}
          view={LP_VIEW}
          sessionReplayUrlTemplate={sessionReplayUrlTemplate}
        />
      </NextIntlClientProvider>,
    );
  }

  it('links a landing-page cell to that page in the configured replay tool', () => {
    renderLpTable('https://clarity.example/imp?Url={landing_page}');
    const link = screen.getByRole('link', { name: 'https://example.com/lp-a' });
    expect(link).toHaveAttribute('href', `https://clarity.example/imp?Url=${encodeURIComponent('https://example.com/lp-a')}`);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders plain text when no template is configured', () => {
    renderLpTable(undefined);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('https://example.com/lp-a')).toBeInTheDocument();
  });

  it('never links a non-landing-page column', () => {
    renderLpTable('https://clarity.example/imp?Url={landing_page}');
    expect(screen.queryByRole('link', { name: 'summer_search' })).not.toBeInTheDocument();
  });

  it('renders no link for an unsafe template scheme', () => {
    renderLpTable('javascript:alert(1)');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
