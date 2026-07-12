'use client';

import { useTranslations } from 'next-intl';
import type { TileFreshness, TileRenderView, TimeSeries } from '@/lib/orgs/board-view';
import { SERIES_STROKE_COLORS, type BoardTileRow } from './board-types';

export interface BoardTileViewProps {
  tile: BoardTileRow;
  view: TileRenderView;
}

const SERIES_COLOR_CLASSES = ['bg-primary', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-500'];

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/**
 * One color index per distinct series *label*, assigned from `view.series`
 * (the current period) — `previousSeries` looks its own color up by this
 * same map (falling back to a fresh index for a label that only exists in
 * the previous period) instead of using its own independent array
 * position. Without this, a dimension breakdown whose set of values
 * differs between the current and previous period (a channel that's new
 * this period, say) would color-index `previousSeries` purely by its own
 * sort order, pairing a solid current-period line with a same-colored but
 * *unrelated* dashed line instead of its own history.
 */
function buildColorIndexByLabel(currentSeries: readonly TimeSeries[], previousSeries: readonly TimeSeries[] = []): Map<string, number> {
  const index = new Map<string, number>();
  for (const series of currentSeries) {
    if (!index.has(series.label)) {
      index.set(series.label, index.size);
    }
  }
  for (const series of previousSeries) {
    if (!index.has(series.label)) {
      index.set(series.label, index.size);
    }
  }
  return index;
}

function UnavailableView({ message, reasonLabel }: { message: string; reasonLabel: string }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input p-4 text-center">
      <span className="text-xs font-medium text-muted-foreground">{reasonLabel}</span>
      <span className="text-xs text-muted-foreground">{message}</span>
    </div>
  );
}

const FRESHNESS_TEXT_CLASS = { fresh: 'text-muted-foreground', stale: 'text-amber-600 dark:text-amber-400' } as const;

/** A tile's data-freshness badge (KAN-69, plan `13 §E13.2`) — the project-wide "as of" timestamp every successfully-queried tile shares (see `computeTileFreshness`'s own doc comment), rendered as small corner text rather than a full status card since it's a secondary signal, not the tile's primary content. */
function TileFreshnessBadge({ freshness }: { freshness: TileFreshness }): React.ReactElement {
  const t = useTranslations('Boards');
  const label = t(freshness.isStale ? 'freshnessStaleLabel' : 'freshnessAsOfLabel', { asOf: freshness.asOf });
  return (
    <span className={`text-[10px] font-medium ${FRESHNESS_TEXT_CLASS[freshness.isStale ? 'stale' : 'fresh']}`} title={label}>
      {label}
    </span>
  );
}

function BigNumberView({ view }: { view: Extract<TileRenderView, { kind: 'big_number' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('bigNumberEmpty')}</p>;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <span className="text-3xl font-bold tabular-nums">{formatNumber(view.value)}</span>
      {view.deltaPct !== undefined ? (
        <span className={view.deltaPct >= 0 ? 'text-xs font-medium text-emerald-600' : 'text-xs font-medium text-rose-600'}>
          {t('tileDeltaLabel', { deltaPct: formatNumber(view.deltaPct) })}
        </span>
      ) : null}
    </div>
  );
}

function LineChartView({ view }: { view: Extract<TileRenderView, { kind: 'time_series' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('timeSeriesEmpty')}</p>;
  }
  const allSeries = [...view.series, ...(view.previousSeries ?? [])];
  const maxValue = Math.max(1, ...allSeries.flatMap((series) => series.points.map((point) => point.value)));
  const colorIndexByLabel = buildColorIndexByLabel(view.series, view.previousSeries);
  const width = 300;
  const height = 100;

  function toPolylinePoints(points: readonly { bucket: string; value: number }[]): string {
    if (points.length === 0) {
      return '';
    }
    return points
      .map((point, index) => {
        const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
        const y = height - (point.value / maxValue) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }

  function colorFor(label: string): string {
    return SERIES_STROKE_COLORS[(colorIndexByLabel.get(label) ?? 0) % SERIES_STROKE_COLORS.length];
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-hidden="true">
        {(view.previousSeries ?? []).map((series) => (
          <polyline
            key={`previous-${series.label}`}
            points={toPolylinePoints(series.points)}
            fill="none"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            stroke={colorFor(series.label)}
            opacity={0.5}
          />
        ))}
        {view.series.map((series) => (
          <polyline key={series.label} points={toPolylinePoints(series.points)} fill="none" strokeWidth={2} stroke={colorFor(series.label)} />
        ))}
      </svg>
      {view.series.length > 1 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {view.series.map((series) => (
            <li key={series.label} className="flex items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${SERIES_COLOR_CLASSES[(colorIndexByLabel.get(series.label) ?? 0) % SERIES_COLOR_CLASSES.length]}`}
              />
              {series.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BarRow({
  points,
  colorClass,
  maxValue,
  muted,
}: {
  points: readonly { bucket: string; value: number }[];
  colorClass: string;
  maxValue: number;
  muted?: boolean;
}): React.ReactElement {
  const t = useTranslations('Boards');
  return (
    <div className="flex h-8 items-end gap-0.5">
      {points.map((point) => (
        <div
          key={point.bucket}
          title={t('barTooltip', { bucket: point.bucket, value: formatNumber(point.value) })}
          className={`w-2 rounded-sm ${colorClass} ${muted ? 'opacity-40' : ''}`}
          style={{ height: `${Math.max(2, Math.round((point.value / maxValue) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function BarChartView({ view }: { view: Extract<TileRenderView, { kind: 'time_series' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('timeSeriesEmpty')}</p>;
  }
  const allSeries = [...view.series, ...(view.previousSeries ?? [])];
  const maxValue = Math.max(1, ...allSeries.flatMap((series) => series.points.map((point) => point.value)));
  const colorIndexByLabel = buildColorIndexByLabel(view.series, view.previousSeries);
  const previousByLabel = new Map((view.previousSeries ?? []).map((series) => [series.label, series]));

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {view.series.map((series) => {
        const colorClass = SERIES_COLOR_CLASSES[(colorIndexByLabel.get(series.label) ?? 0) % SERIES_COLOR_CLASSES.length];
        const previous = previousByLabel.get(series.label);
        return (
          <div key={series.label} className="flex flex-col gap-1" role="img" aria-label={series.label}>
            {view.series.length > 1 ? <span className="text-xs text-muted-foreground">{series.label}</span> : null}
            <BarRow points={series.points} colorClass={colorClass} maxValue={maxValue} />
            {previous ? (
              <>
                <span className="text-xs text-muted-foreground">{t('previousPeriodLabel')}</span>
                <BarRow points={previous.points} colorClass={colorClass} maxValue={maxValue} muted />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TableView({ view }: { view: Extract<TileRenderView, { kind: 'table' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('tableEmpty')}</p>;
  }
  return (
    <div className="max-h-48 overflow-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            {view.columns.map((column) => (
              <th key={column} className="border-b border-input px-2 py-1 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row, index) => (
            <tr key={index}>
              {view.columns.map((column) => (
                <td key={column} className="border-b border-input px-2 py-1 tabular-nums">
                  {row[column] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeatmapView({ view }: { view: Extract<TileRenderView, { kind: 'heatmap' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('heatmapEmpty')}</p>;
  }
  const maxValue = Math.max(1e-9, ...view.matrix.flat().filter((value): value is number => value !== null));
  return (
    <div className="max-h-48 overflow-auto">
      <table className="w-full text-center text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1" />
            {view.columnLabels.map((column) => (
              <th key={column} className="border-b border-input px-2 py-1 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rowLabels.map((row, rowIndex) => (
            <tr key={row}>
              <th className="border-r border-input px-2 py-1 text-left font-medium">{row}</th>
              {view.columnLabels.map((column, columnIndex) => {
                const value = view.matrix[rowIndex][columnIndex];
                return (
                  <td
                    key={column}
                    className="px-2 py-1 tabular-nums"
                    style={value === null ? undefined : { backgroundColor: `rgba(59, 130, 246, ${Math.max(0.08, value / maxValue)})` }}
                    title={t('heatmapCellTooltip', { row, column, value: value === null ? '—' : formatNumber(value) })}
                  >
                    {value === null ? '—' : formatNumber(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reuses `BarRow` (the same bar-with-tooltip renderer `BarChartView` already uses for a time series) for the bars themselves, adding only a per-bucket label row underneath — `BarRow`'s own bars are a fixed `w-2` each with a `gap-0.5` row, so this label row matches those exact widths/gap to stay aligned underneath. */
function HistogramView({ view }: { view: Extract<TileRenderView, { kind: 'histogram' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('histogramEmpty')}</p>;
  }
  const maxValue = Math.max(1, ...view.values);
  const points = view.labels.map((label, index) => ({ bucket: label, value: view.values[index] }));
  return (
    <div className="flex flex-col gap-1" role="img" aria-label={t('histogramAriaLabel')}>
      <BarRow points={points} colorClass={SERIES_COLOR_CLASSES[0]} maxValue={maxValue} />
      <div className="flex gap-0.5">
        {view.labels.map((label) => (
          <span key={label} className="w-2 flex-shrink-0 truncate text-center text-[10px] text-muted-foreground">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FunnelView({ view }: { view: Extract<TileRenderView, { kind: 'funnel' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('funnelEmpty')}</p>;
  }
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {view.steps.map((step, index) => (
        <div key={step.metricName} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{step.metricName}</span>
            <span className="tabular-nums text-muted-foreground">
              {t('funnelStepValueLabel', { total: formatNumber(step.total), pctOfFirstStep: formatNumber(step.pctOfFirstStep) })}
            </span>
          </div>
          <div className="h-4 rounded-sm bg-muted">
            <div
              className={`h-4 rounded-sm ${SERIES_COLOR_CLASSES[index % SERIES_COLOR_CLASSES.length]}`}
              style={{ width: `${Math.max(2, Math.round(step.pctOfFirstStep))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Renders one tile's already-queried, already-shaped data (see `buildTileRenderView` in `lib/orgs/board-view.ts`) — every tile type from the KAN-60 AC (line/bar/big-number/table/funnel) plus KAN-62's `heatmap` and KAN-63's `histogram`, plus a per-tile degraded state instead of the whole board failing. A `freshness` badge (KAN-69) floats in the tile's top-right corner for every kind except `unavailable`, which has no queried data to attach one to. Both consumers of this component (the board detail page's grid and the TV war-room rotation, `tv-rotation-screen.tsx`) get the badge for free — there's no TV-specific rendering fork to keep in sync. */
export function BoardTileView({ tile, view }: BoardTileViewProps): React.ReactElement {
  const t = useTranslations('Boards');

  const content = (() => {
    switch (view.kind) {
      case 'unavailable':
        return <UnavailableView message={view.message} reasonLabel={t(`tileUnavailableReason.${view.reason}`)} />;
      case 'big_number':
        return <BigNumberView view={view} />;
      case 'time_series':
        return view.chart === 'line' ? <LineChartView view={view} /> : <BarChartView view={view} />;
      case 'table':
        return <TableView view={view} />;
      case 'funnel':
        return <FunnelView view={view} />;
      case 'heatmap':
        return <HeatmapView view={view} />;
      case 'histogram':
        return <HistogramView view={view} />;
      default:
        return <UnavailableView message={tile.title} reasonLabel={t('tileUnavailableReason.query_error')} />;
    }
  })();

  const freshness = view.kind === 'unavailable' ? null : view.freshness;
  return (
    <div className="relative h-full">
      {freshness ? (
        <div className="absolute right-0 top-0">
          <TileFreshnessBadge freshness={freshness} />
        </div>
      ) : null}
      {content}
    </div>
  );
}
