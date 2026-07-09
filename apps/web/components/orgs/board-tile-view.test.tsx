import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BoardTileView } from './board-tile-view';
import type { BoardTileRow } from './board-types';
import messages from '../../messages/en.json';
import type { TileRenderView } from '@/lib/orgs/board-view';

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
    renderTile({ kind: 'big_number', value: 150, previousValue: 100, deltaPct: 50 });
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('50% vs. previous')).toBeInTheDocument();
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
      },
      { type: 'line' },
    );
    expect(screen.getByText('google')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
  });

  it('renders a time_series bar tile', () => {
    renderTile({ kind: 'time_series', chart: 'bar', series: [{ label: 'all', points: [{ bucket: '2026-01-01', value: 10 }] }] }, { type: 'bar' });
    expect(screen.getByRole('img', { name: 'all' })).toBeInTheDocument();
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
      },
      { type: 'bar' },
    );
    expect(screen.getByText('Previous period')).toBeInTheDocument();
    expect(screen.getByTitle('2025-12-01: 8')).toBeInTheDocument();
  });

  it('renders a table tile', () => {
    renderTile({ kind: 'table', columns: ['bucket_date', 'ad_spend'], rows: [{ bucket_date: '2026-01-01', ad_spend: 100 }] }, { type: 'table' });
    expect(screen.getByText('bucket_date')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders an empty table state', () => {
    renderTile({ kind: 'table', columns: [], rows: [] }, { type: 'table' });
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
      },
      { type: 'funnel', metricNames: ['signups', 'purchases'] },
    );
    expect(screen.getByText('signups')).toBeInTheDocument();
    expect(screen.getByText('25 (25%)')).toBeInTheDocument();
  });
});
