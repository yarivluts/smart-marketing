import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BoardTileView } from './board-tile-view';
import type { BoardTileRow } from './board-types';
import messages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
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
    expect(screen.getByRole('figure', { name: 'Ad spend' })).toBeInTheDocument();
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
          {
            label: 'google',
            points: [
              { bucket: '2026-01-01', value: 10 },
              { bucket: '2026-01-02', value: 12 },
            ],
          },
          {
            label: 'meta',
            points: [
              { bucket: '2026-01-01', value: 5 },
              { bucket: '2026-01-02', value: 6 },
            ],
          },
        ],
        previousSeries: [
          {
            label: 'google',
            points: [
              { bucket: '2025-12-30', value: 8 },
              { bucket: '2025-12-31', value: 9 },
            ],
          },
        ],
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

  describe('gaps - a bucket with no value (KAN-210 follow-up)', () => {
    const withGap = [
      { bucket: '2026-09-23', value: 1 },
      { bucket: '2026-09-24', value: null },
      { bucket: '2026-09-25', value: 3 },
      { bucket: '2026-09-26', value: 4 },
    ];

    it('a line breaks at a gap instead of drawing straight across it', () => {
      const { container } = renderTile(
        { kind: 'time_series', chart: 'line', series: [{ label: 'all', points: withGap }], isEmpty: false, freshness: null },
        { type: 'line', title: 'CAC' },
      );
      const lines = container.querySelectorAll('polyline');
      // Only the 9/25-9/26 run is a line; 9/23 stands alone (drawn as its labelled dot), and nothing
      // connects 9/23 to 9/25.
      expect(lines).toHaveLength(1);
      expect(lines[0].getAttribute('points')?.split(' ')).toHaveLength(2);
      const table = screen.getByRole('table', { name: 'CAC' });
      expect(within(table).getByRole('row', { name: '2026-09-24 No value' })).toBeInTheDocument();
    });

    it('a lone value between two gaps is still drawn, as a dot, when it carries no label', () => {
      const lone = [
        { bucket: '2026-09-23', value: null },
        { bucket: '2026-09-24', value: 2 },
        { bucket: '2026-09-25', value: null },
      ];
      const { container } = renderTile(
        {
          kind: 'time_series',
          chart: 'line',
          series: [
            { label: 'google', points: lone },
            { label: 'meta', points: lone },
          ],
          isEmpty: false,
          freshness: null,
        },
        { type: 'line' },
      );
      expect(container.querySelectorAll('polyline')).toHaveLength(0);
      expect(container.querySelectorAll('[data-testid="series-dot"]')).toHaveLength(2);
    });

    it('a bar tile leaves an empty, labelled slot for a gap rather than a zero-height bar', () => {
      const { container } = renderTile(
        { kind: 'time_series', chart: 'bar', series: [{ label: 'all', points: withGap }], isEmpty: false, freshness: null },
        { type: 'bar', title: 'CAC' },
      );
      expect(container.querySelectorAll('[data-testid="series-bar"]')).toHaveLength(3);
      expect(screen.getByTitle('2026-09-24: no value')).toHaveAttribute('data-testid', 'series-bar-gap');
    });

    it('a real zero is still a bar and a point, never a gap', () => {
      const { container } = renderTile(
        {
          kind: 'time_series',
          chart: 'bar',
          series: [
            {
              label: 'all',
              points: [
                { bucket: '2026-09-24', value: 0 },
                { bucket: '2026-09-25', value: 2 },
              ],
            },
          ],
          isEmpty: false,
          freshness: null,
        },
        { type: 'bar' },
      );
      expect(container.querySelectorAll('[data-testid="series-bar"]')).toHaveLength(2);
      expect(container.querySelectorAll('[data-testid="series-bar-gap"]')).toHaveLength(0);
    });
  });

  describe('readable time-series labels (KAN-210)', () => {
    const signupsPerDay = [
      { bucket: '2026-09-24', value: 1 },
      { bucket: '2026-09-25', value: 3 },
      { bucket: '2026-09-26', value: 0 },
    ];

    /** The drawn (aria-hidden) plot + axis - what a sighted reader or a screenshot sees. */
    function visiblePlot(container: HTMLElement): HTMLElement {
      const plot = container.querySelector<HTMLElement>('[dir="ltr"][aria-hidden="true"]');
      expect(plot).not.toBeNull();
      return plot!;
    }

    it.each(['bar', 'line'] as const)('prints each %s value and its bucket date as text on the chart', (chart) => {
      const { container } = renderTile(
        { kind: 'time_series', chart, series: [{ label: 'all', points: signupsPerDay }], isEmpty: false, freshness: null },
        { type: chart, title: 'Signups per day' },
      );
      const plot = within(visiblePlot(container));
      for (const text of ['1', '3', '0', '9/24', '9/25', '9/26']) {
        expect(plot.getByText(text)).toBeInTheDocument();
      }
    });

    it.each(['bar', 'line'] as const)('exposes the %s series to assistive tech as a captioned table of date and value', (chart) => {
      renderTile(
        { kind: 'time_series', chart, series: [{ label: 'all', points: signupsPerDay }], isEmpty: false, freshness: null },
        { type: chart, title: 'Signups per day' },
      );
      const table = screen.getByRole('table', { name: 'Signups per day' });
      expect(within(table).getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
      expect(within(table).getByRole('row', { name: '2026-09-25 3' })).toBeInTheDocument();
    });

    it('formats the axis dates for the Hebrew locale and keeps the plot left-to-right', () => {
      const { container } = render(
        <NextIntlClientProvider locale="he" messages={heMessages}>
          <BoardTileView
            tile={tile({ type: 'bar', title: 'Signups per day' })}
            view={{ kind: 'time_series', chart: 'bar', series: [{ label: 'all', points: signupsPerDay }], isEmpty: false, freshness: null }}
          />
        </NextIntlClientProvider>,
      );
      const plot = visiblePlot(container);
      expect(within(plot).getByText('25.9')).toBeInTheDocument();
      expect(within(plot).getByText('3')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: heMessages.Boards.chartBucketColumn })).toBeInTheDocument();
    });

    it('pairs a muted previous-period bar beside each current bar in the same plot, with its own captioned table', () => {
      const { container } = renderTile(
        {
          kind: 'time_series',
          chart: 'bar',
          series: [{ label: 'all', points: [{ bucket: '2026-09-25', value: 3 }] }],
          previousSeries: [{ label: 'all', points: [{ bucket: '2026-09-18', value: 7 }] }],
          isEmpty: false,
          freshness: null,
        },
        { type: 'bar', title: 'Signups per day' },
      );
      const plots = container.querySelectorAll<HTMLElement>('[dir="ltr"][aria-hidden="true"]');
      expect(plots).toHaveLength(1);
      const plot = within(plots[0]);
      expect(plot.getByText('3')).toBeInTheDocument();
      expect(plot.getByText('9/25')).toBeInTheDocument();
      expect(plot.getByTitle('2026-09-18: 7')).toHaveClass('opacity-40');
      expect(screen.getByText('Previous period')).toBeInTheDocument();
      const previousTable = screen.getByRole('table', { name: 'Signups per day (previous period)' });
      expect(within(previousTable).getByRole('row', { name: '2026-09-18 7' })).toBeInTheDocument();
    });

    it('puts each series\' latest value in the legend of a split line tile rather than on colliding points', () => {
      const { container } = renderTile(
        {
          kind: 'time_series',
          chart: 'line',
          series: [
            { label: 'google', points: [{ bucket: '2026-09-24', value: 4 }, { bucket: '2026-09-25', value: 10 }] },
            { label: 'meta', points: [{ bucket: '2026-09-24', value: 2 }, { bucket: '2026-09-25', value: 5 }] },
          ],
          isEmpty: false,
          freshness: null,
        },
        { type: 'line' },
      );
      const legendItems = [...container.querySelectorAll('ul li')].map((item) => item.textContent);
      expect(legendItems).toEqual(['google10', 'meta5']);
      expect(within(visiblePlot(container)).getByText('9/25')).toBeInTheDocument();
    });

    it('thins labels on a long series so they do not collide, while the table keeps every value', () => {
      const points = Array.from({ length: 30 }, (_, index) => ({
        bucket: `2026-09-${String(index + 1).padStart(2, '0')}`,
        value: index === 10 ? 50 : 2,
      }));
      const { container } = renderTile(
        { kind: 'time_series', chart: 'bar', series: [{ label: 'all', points }], isEmpty: false, freshness: null },
        { type: 'bar', title: 'Signups per day' },
      );
      const plot = within(visiblePlot(container));
      expect(plot.getByText('50')).toBeInTheDocument(); // the peak
      expect(plot.getAllByText('2')).toHaveLength(1); // only the latest of the 29 other bars
      expect(plot.getByText('9/30')).toBeInTheDocument(); // the latest bucket is always on the axis
      expect(within(screen.getByRole('table', { name: 'Signups per day' })).getAllByRole('row')).toHaveLength(31);
    });

    it('captions each series table of a split line tile with the tile title and the series', () => {
      renderTile(
        {
          kind: 'time_series',
          chart: 'line',
          series: [
            { label: 'google', points: [{ bucket: '2026-09-25', value: 10 }] },
            { label: 'meta', points: [{ bucket: '2026-09-25', value: 5 }] },
          ],
          isEmpty: false,
          freshness: null,
        },
        { type: 'line' },
      );
      expect(screen.getByRole('table', { name: 'Ad spend · google' })).toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Ad spend · meta' })).toBeInTheDocument();
    });
  });

  describe('a split tile stays inside its grid cell (KAN-217)', () => {
    const byCampaign = (values: Record<string, number>) => ({
      kind: 'time_series' as const,
      chart: 'bar' as const,
      series: Object.entries(values).map(([label, value]) => ({ label, points: [{ bucket: '2026-09-25', value }] })),
      isEmpty: false,
      freshness: null,
    });

    it('clips the tile body and scrolls it, rather than letting content paint over the tile below', () => {
      const { getByTestId } = renderTile(byCampaign({ a: 1, b: 2 }), { type: 'bar' });
      const body = getByTestId('board-tile-body');
      expect(body).toHaveClass('h-full', 'overflow-y-auto', 'overflow-x-hidden');
    });

    it('draws at most three per-campaign plots and summarises the rest behind "+N more"', () => {
      const { container } = renderTile(byCampaign({ spring: 0.12, summer: 0.5, autumn: 0.08, winter: 0.3, brand: 0.02 }), {
        type: 'bar',
        title: 'Conversion rate',
      });
      // One plot (a labelled <figure>) per drawn campaign: the three with the largest values.
      const plots = container.querySelectorAll('figure');
      expect([...plots].map((plot) => plot.getAttribute('aria-label'))).toEqual([
        'Conversion rate · spring',
        'Conversion rate · summer',
        'Conversion rate · winter',
      ]);
      expect(container.querySelectorAll('[data-testid="series-bar"]')).toHaveLength(3);

      const more = screen.getByTestId('small-multiples-more');
      expect(within(more).getByText('+2 more')).toBeInTheDocument();
      expect(within(more).getByText('autumn')).toBeInTheDocument();
      expect(within(more).getByText('0.08')).toBeInTheDocument();
      expect(within(more).getByText('brand')).toBeInTheDocument();
      // The hidden campaigns' numbers still reach assistive tech.
      expect(screen.getByRole('table', { name: 'Conversion rate · autumn' })).toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Conversion rate · brand' })).toBeInTheDocument();
    });

    it('shows no "+N more" when the split fits under the cap', () => {
      renderTile(byCampaign({ a: 1, b: 2, c: 3 }), { type: 'bar' });
      expect(screen.queryByTestId('small-multiples-more')).not.toBeInTheDocument();
    });

    it('translates the "+N more" affordance', () => {
      render(
        <NextIntlClientProvider locale="he" messages={heMessages}>
          <BoardTileView tile={tile({ type: 'bar' })} view={byCampaign({ a: 1, b: 2, c: 3, d: 4 })} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(heMessages.Boards.moreSeriesLabel.replace('{count}', '1'))).toBeInTheDocument();
    });
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
