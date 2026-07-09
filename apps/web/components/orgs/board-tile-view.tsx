'use client';

import { useTranslations } from 'next-intl';
import type { TileRenderView } from '@/lib/orgs/board-view';
import type { BoardTileRow } from './board-types';

export interface BoardTileViewProps {
  tile: BoardTileRow;
  view: TileRenderView;
}

const SERIES_COLOR_CLASSES = ['bg-primary', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-500'];
const SERIES_STROKE_COLORS = ['var(--primary)', '#3b82f6', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6'];

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function UnavailableView({ message, reasonLabel }: { message: string; reasonLabel: string }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input p-4 text-center">
      <span className="text-xs font-medium text-muted-foreground">{reasonLabel}</span>
      <span className="text-xs text-muted-foreground">{message}</span>
    </div>
  );
}

function BigNumberView({ view }: { view: Extract<TileRenderView, { kind: 'big_number' }> }): React.ReactElement {
  const t = useTranslations('Boards');
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
  const allSeries = [...view.series, ...(view.previousSeries ?? [])];
  const maxValue = Math.max(1, ...allSeries.flatMap((series) => series.points.map((point) => point.value)));
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

  return (
    <div className="flex h-full flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-hidden="true">
        {(view.previousSeries ?? []).map((series, index) => (
          <polyline
            key={`previous-${series.label}`}
            points={toPolylinePoints(series.points)}
            fill="none"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            stroke={SERIES_STROKE_COLORS[index % SERIES_STROKE_COLORS.length]}
            opacity={0.5}
          />
        ))}
        {view.series.map((series, index) => (
          <polyline
            key={series.label}
            points={toPolylinePoints(series.points)}
            fill="none"
            strokeWidth={2}
            stroke={SERIES_STROKE_COLORS[index % SERIES_STROKE_COLORS.length]}
          />
        ))}
      </svg>
      {view.series.length > 1 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {view.series.map((series, index) => (
            <li key={series.label} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${SERIES_COLOR_CLASSES[index % SERIES_COLOR_CLASSES.length]}`} />
              {series.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BarChartView({ view }: { view: Extract<TileRenderView, { kind: 'time_series' }> }): React.ReactElement {
  const maxValue = Math.max(1, ...view.series.flatMap((series) => series.points.map((point) => point.value)));
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {view.series.map((series, index) => (
        <div key={series.label} className="flex flex-col gap-1">
          {view.series.length > 1 ? <span className="text-xs text-muted-foreground">{series.label}</span> : null}
          <div className="flex h-8 items-end gap-0.5" role="img" aria-label={series.label}>
            {series.points.map((point) => (
              <div
                key={point.bucket}
                title={`${point.bucket}: ${formatNumber(point.value)}`}
                className={`w-2 rounded-sm ${SERIES_COLOR_CLASSES[index % SERIES_COLOR_CLASSES.length]}`}
                style={{ height: `${Math.max(2, Math.round((point.value / maxValue) * 100))}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableView({ view }: { view: Extract<TileRenderView, { kind: 'table' }> }): React.ReactElement {
  const t = useTranslations('Boards');
  if (view.rows.length === 0) {
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

function FunnelView({ view }: { view: Extract<TileRenderView, { kind: 'funnel' }> }): React.ReactElement {
  const t = useTranslations('Boards');
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

/** Renders one tile's already-queried, already-shaped data (see `buildTileRenderView` in `lib/orgs/board-view.ts`) — every tile type from the KAN-60 AC (line/bar/big-number/table/funnel), plus a per-tile degraded state instead of the whole board failing. */
export function BoardTileView({ tile, view }: BoardTileViewProps): React.ReactElement {
  const t = useTranslations('Boards');

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
    default:
      return <UnavailableView message={tile.title} reasonLabel={t('tileUnavailableReason.query_error')} />;
  }
}
