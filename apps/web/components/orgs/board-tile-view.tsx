'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { buildSessionReplayLink, sessionReplayTemplateFiltersByPage } from '@growthos/shared';
import type { TileFreshness, TileRenderView, TimeSeries, TimeSeriesPoint } from '@/lib/orgs/board-view';
import { formatBucketLabels, labeledAxisIndexes, labeledValueIndexes, latestPresentPoint, splitAtGaps } from '@/lib/orgs/chart-labels';
import { SERIES_STROKE_COLORS, type BoardTileRow } from './board-types';

export interface BoardTileViewProps {
  tile: BoardTileRow;
  view: TileRenderView;
  /** The project's session-replay deep-link template, if configured — turns landing-page table cells into links to that page's recordings. */
  sessionReplayUrlTemplate?: string;
}

/**
 * Dimension columns whose values are landing-page URLs, and so are worth
 * deep-linking into a session-replay tool. Matched by column name because a
 * table tile's rendered columns are its dimension names (see
 * `buildTileRenderView`); only the landing-page pack registers this one.
 */
const LANDING_PAGE_COLUMNS = new Set(['landing_page']);

const SERIES_COLOR_CLASSES = ['bg-primary', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-500'];

function formatNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/** The largest real value across every series (gaps ignored), floored at 1 so an all-zero chart still has a scale. */
function maxSeriesValue(series: readonly TimeSeries[]): number {
  return Math.max(1, ...series.flatMap((entry) => entry.points.flatMap((point) => (point.value === null ? [] : [point.value]))));
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

/**
 * The accessible form of one time-series (KAN-210): every bucket and value as a real table, hidden
 * visually. The drawn chart beside it is `aria-hidden`, so a screen reader gets the numbers once, in
 * a shape it can navigate, rather than a picture it cannot read. The bucket is the raw, unabbreviated
 * date so it stays unambiguous where the axis label drops the year.
 */
function SeriesDataTable({ caption, points, locale }: { caption: string; points: readonly TimeSeriesPoint[]; locale: string }): React.ReactElement {
  const t = useTranslations('Boards');
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t('chartBucketColumn')}</th>
          <th scope="col">{t('chartValueColumn')}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.bucket}>
            <th scope="row">{point.bucket}</th>
            <td>{point.value === null ? t('chartNoValue') : formatNumber(point.value, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal placement for a label centred on `xPct`, pinned inward at either edge so the first and last labels never spill out of the tile. */
function edgeAwareTranslateX(xPct: number): string {
  return xPct <= 0 ? '0' : xPct >= 100 ? '-100%' : '-50%';
}

/** A chart's accessible name: the tile title, qualified by the series label when a dimension splits the tile into several series. */
function useSeriesCaption(title: string, seriesCount: number): (seriesLabel: string) => string {
  const t = useTranslations('Boards');
  return (seriesLabel) => (seriesCount > 1 ? t('chartSeriesCaption', { title, series: seriesLabel }) : title);
}

function LineChartView({ view, title }: { view: Extract<TileRenderView, { kind: 'time_series' }>; title: string }): React.ReactElement {
  const t = useTranslations('Boards');
  const locale = useLocale();
  const captionFor = useSeriesCaption(title, view.series.length);
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('timeSeriesEmpty')}</p>;
  }
  const maxValue = maxSeriesValue([...view.series, ...(view.previousSeries ?? [])]);
  const colorIndexByLabel = buildColorIndexByLabel(view.series, view.previousSeries);

  // Current-period points are placed by their bucket's position on one shared axis, so two series
  // that don't cover the same buckets still line up with each other and with the axis labels.
  const buckets = [...new Set(view.series.flatMap((series) => series.points.map((point) => point.bucket)))].sort();
  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket, index]));
  const bucketLabels = formatBucketLabels(buckets, locale);
  const axisIndexes = labeledAxisIndexes(buckets.length);

  function xPct(index: number, count: number): number {
    return count <= 1 ? 50 : (index / (count - 1)) * 100;
  }
  function yPct(value: number): number {
    return 100 - (value / maxValue) * 100;
  }
  function currentX(point: { bucket: string }): number {
    return xPct(bucketIndex.get(point.bucket) ?? 0, buckets.length);
  }
  function colorFor(label: string): string {
    return SERIES_STROKE_COLORS[(colorIndexByLabel.get(label) ?? 0) % SERIES_STROKE_COLORS.length];
  }

  // Each series is drawn as one line per run of consecutive real values: a gap ("no value") breaks
  // the line rather than being bridged, and a value with gaps on both sides - a run of one - is
  // drawn as a dot, since a one-point polyline draws nothing.
  const lines = [
    ...(view.previousSeries ?? []).flatMap((series) =>
      splitAtGaps(series.points).map((run, runIndex) => ({
        key: `previous-${series.label}-${runIndex}`,
        coords: run.map((point) => ({ x: xPct(point.index, series.points.length), y: yPct(point.value) })),
        color: colorFor(series.label),
        previous: true,
      })),
    ),
    ...view.series.flatMap((series) =>
      splitAtGaps(series.points).map((run, runIndex) => ({
        key: `${series.label}-${runIndex}`,
        coords: run.map((point) => ({ x: currentX(point), y: yPct(point.value) })),
        color: colorFor(series.label),
        previous: false,
      })),
    ),
  ];

  // One series labels its values on the line (all of them, or peak + latest when long). Several
  // series would collide there, so each one's latest value goes in the legend beside its name instead.
  const isSingleSeries = view.series.length === 1;
  const valueLabels = isSingleSeries
    ? view.series.flatMap((series) => {
        const indexes = labeledValueIndexes(series.points.map((point) => point.value));
        return splitAtGaps(series.points)
          .flat()
          .filter((point) => indexes.has(point.index))
          .map((point) => ({ key: `${series.label}-${point.bucket}`, x: currentX(point), y: yPct(point.value), value: point.value, color: colorFor(series.label) }));
      })
    : [];
  const labeledKeys = new Set(valueLabels.map((label) => `${label.x},${label.y}`));
  const isolatedDots = lines
    .filter((line) => line.coords.length === 1 && !labeledKeys.has(`${line.coords[0].x},${line.coords[0].y}`))
    .map((line) => ({ key: line.key, ...line.coords[0], color: line.color, previous: line.previous }));

  return (
    <figure className="flex h-full flex-col gap-2" aria-label={title}>
      <div dir="ltr" aria-hidden="true" className="flex flex-col">
        <div className="pt-4">
          <div className="relative h-20">
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
              {lines
                .filter((line) => line.coords.length > 1)
                .map((line) => (
                  <polyline
                    key={line.key}
                    data-testid="series-line"
                    points={line.coords.map((coord) => `${coord.x},${coord.y}`).join(' ')}
                    fill="none"
                    strokeWidth={line.previous ? 1.5 : 2}
                    vectorEffect="non-scaling-stroke"
                    stroke={line.color}
                    {...(line.previous ? { strokeDasharray: '4 3', opacity: 0.5 } : {})}
                  />
                ))}
            </svg>
            {isolatedDots.map((dot) => (
              <span
                key={dot.key}
                data-testid="series-dot"
                className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot.previous ? 'opacity-50' : ''}`}
                style={{ left: `${dot.x}%`, top: `${dot.y}%`, backgroundColor: dot.color }}
              />
            ))}
            {valueLabels.map((label) => (
              <span key={label.key}>
                <span
                  className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                  style={{ left: `${label.x}%`, top: `${label.y}%`, backgroundColor: label.color }}
                />
                <span
                  className="absolute whitespace-nowrap text-[10px] font-medium leading-none tabular-nums text-foreground"
                  style={{ left: `${label.x}%`, top: `${label.y}%`, transform: `translate(${edgeAwareTranslateX(label.x)}, calc(-100% - 5px))` }}
                >
                  {formatNumber(label.value, locale)}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="relative mt-1 h-3 border-t border-border">
          {buckets.map((bucket, index) =>
            axisIndexes.has(index) ? (
              <span
                key={bucket}
                className="absolute top-0.5 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground"
                style={{ left: `${xPct(index, buckets.length)}%`, transform: `translateX(${edgeAwareTranslateX(xPct(index, buckets.length))})` }}
              >
                {bucketLabels[index]}
              </span>
            ) : null,
          )}
        </div>
      </div>
      {!isSingleSeries ? (
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden="true">
          {view.series.map((series) => {
            const latest = latestPresentPoint(series.points);
            return (
              <li key={series.label} className="flex items-center gap-1">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${SERIES_COLOR_CLASSES[(colorIndexByLabel.get(series.label) ?? 0) % SERIES_COLOR_CLASSES.length]}`}
                />
                <span>{series.label}</span>
                {latest ? <span className="font-medium tabular-nums text-foreground">{formatNumber(latest.value, locale)}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {view.series.map((series) => (
        <SeriesDataTable key={series.label} caption={captionFor(series.label)} points={series.points} locale={locale} />
      ))}
      {(view.previousSeries ?? []).map((series) => (
        <SeriesDataTable
          key={`previous-${series.label}`}
          caption={t('chartPreviousPeriodCaption', { caption: captionFor(series.label) })}
          points={series.points}
          locale={locale}
        />
      ))}
    </figure>
  );
}

/** The fixed-width bar strip the histogram tile draws (its labels are rendered by `HistogramView` itself). */
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

/**
 * One labelled bar plot (KAN-210): each bar carries its value above it and its bucket date on the
 * axis beneath, so a board screenshot reads "3 on 25.9" without hovering. A previous period, when
 * compared, is drawn as a muted bar beside each current one (paired by position, the same pairing the
 * line tile's dashed overlay uses) rather than as a second plot, so a compared tile still fits its
 * grid cell; its values are in the tooltip and the table rather than printed, to keep the labels
 * from colliding. Forced left-to-right so time runs the same way in the Hebrew UI as the line tile's
 * SVG does; text uses the foreground/muted tokens, so it follows dark mode. `aria-hidden` because
 * `SeriesDataTable` carries the same numbers for assistive tech.
 */
function LabeledBarPlot({
  points,
  previousPoints,
  colorClass,
  maxValue,
  compact,
  locale,
}: {
  points: readonly TimeSeriesPoint[];
  previousPoints?: readonly TimeSeriesPoint[];
  colorClass: string;
  maxValue: number;
  compact?: boolean;
  locale: string;
}): React.ReactElement {
  const t = useTranslations('Boards');
  const bucketLabels = formatBucketLabels(
    points.map((point) => point.bucket),
    locale,
  );
  const valueIndexes = labeledValueIndexes(points.map((point) => point.value));
  const columnCount = Math.max(points.length, previousPoints?.length ?? 0);
  const axisIndexes = labeledAxisIndexes(columnCount);
  const heightPct = (value: number) => `${Math.max(2, Math.round((value / maxValue) * 100))}%`;

  function tooltip(point: TimeSeriesPoint | undefined): string | undefined {
    if (!point) {
      return undefined;
    }
    return point.value === null
      ? t('barTooltipNoValue', { bucket: point.bucket })
      : t('barTooltip', { bucket: point.bucket, value: formatNumber(point.value, locale) });
  }

  return (
    <div dir="ltr" aria-hidden="true" className="flex flex-col">
      <div className={`flex items-end gap-1 border-b border-border pt-4 ${compact ? 'h-16' : 'h-24'}`}>
        {Array.from({ length: columnCount }, (_, index) => {
          const point = points[index];
          const previous = previousPoints?.[index];
          return (
            <div key={point?.bucket ?? `previous-${index}`} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
              {point && point.value !== null ? (
                <div
                  title={tooltip(point)}
                  data-testid="series-bar"
                  className={`relative w-full max-w-8 rounded-t-sm ${colorClass}`}
                  style={{ height: heightPct(point.value) }}
                >
                  {valueIndexes.has(index) ? (
                    <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none tabular-nums text-foreground">
                      {formatNumber(point.value, locale)}
                    </span>
                  ) : null}
                </div>
              ) : point ? (
                // "No value" for this bucket: an empty slot, not a 0-height (or 2%-stub) bar that would read as zero.
                <div title={tooltip(point)} data-testid="series-bar-gap" className="h-full w-full max-w-8" />
              ) : null}
              {previous && previous.value !== null ? (
                <div
                  title={tooltip(previous)}
                  className={`w-full max-w-8 rounded-t-sm opacity-40 ${colorClass}`}
                  style={{ height: heightPct(previous.value) }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex h-3.5 gap-1">
        {Array.from({ length: columnCount }, (_, index) => (
          <div key={index} className="relative min-w-0 flex-1">
            {axisIndexes.has(index) && index < points.length ? (
              <span className="absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground">
                {bucketLabels[index]}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChartView({ view, title }: { view: Extract<TileRenderView, { kind: 'time_series' }>; title: string }): React.ReactElement {
  const t = useTranslations('Boards');
  const locale = useLocale();
  const captionFor = useSeriesCaption(title, view.series.length);
  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('timeSeriesEmpty')}</p>;
  }
  const maxValue = maxSeriesValue([...view.series, ...(view.previousSeries ?? [])]);
  const colorIndexByLabel = buildColorIndexByLabel(view.series, view.previousSeries);
  const previousByLabel = new Map((view.previousSeries ?? []).map((series) => [series.label, series]));
  // Several stacked plots must share the tile's height, so each gets a shorter plot area.
  const compact = view.series.length > 1;

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {view.series.map((series) => {
        const colorClass = SERIES_COLOR_CLASSES[(colorIndexByLabel.get(series.label) ?? 0) % SERIES_COLOR_CLASSES.length];
        const previous = previousByLabel.get(series.label);
        const caption = captionFor(series.label);
        return (
          <figure key={series.label} className="flex flex-col gap-1" aria-label={caption}>
            {view.series.length > 1 || previous ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
                {view.series.length > 1 ? <span>{series.label}</span> : null}
                {previous ? (
                  <span className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-sm opacity-40 ${colorClass}`} />
                    {t('previousPeriodLabel')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <LabeledBarPlot points={series.points} previousPoints={previous?.points} colorClass={colorClass} maxValue={maxValue} compact={compact} locale={locale} />
            <SeriesDataTable caption={caption} points={series.points} locale={locale} />
            {previous ? (
              <SeriesDataTable caption={t('chartPreviousPeriodCaption', { caption })} points={previous.points} locale={locale} />
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

interface TableColumnPrefs {
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  hiddenColumns: string[];
}

const DEFAULT_TABLE_COLUMN_PREFS: TableColumnPrefs = { sortColumn: null, sortDirection: 'asc', hiddenColumns: [] };

function tableColumnPrefsStorageKey(tileId: string): string {
  return `growthos-board-tile-${tileId}-table-prefs`;
}

/**
 * KAN-85's "column sort/show-hide persistence" (Gap 15) — per-tile, client-
 * only (no server round-trip; `BoardTile`'s schema is a strictly-validated
 * fixed shape, see `board.service.ts`'s `validateTiles`, not an open config
 * bag worth extending for a per-viewer display preference). Same
 * `typeof window` guard + try/catch-swallow shape as `tv-app.tsx`'s device-
 * token persistence, the only other `localStorage` use in this app — a
 * private-browsing quota error, or a stale/corrupt value from an older
 * shape, must fall back to the unsorted, all-columns-visible default rather
 * than breaking the tile.
 */
function readTableColumnPrefs(tileId: string): TableColumnPrefs {
  if (typeof window === 'undefined') {
    return DEFAULT_TABLE_COLUMN_PREFS;
  }
  try {
    const raw = window.localStorage.getItem(tableColumnPrefsStorageKey(tileId));
    if (!raw) {
      return DEFAULT_TABLE_COLUMN_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<TableColumnPrefs>;
    return {
      sortColumn: typeof parsed.sortColumn === 'string' ? parsed.sortColumn : null,
      sortDirection: parsed.sortDirection === 'desc' ? 'desc' : 'asc',
      hiddenColumns: Array.isArray(parsed.hiddenColumns)
        ? parsed.hiddenColumns.filter((column): column is string => typeof column === 'string')
        : [],
    };
  } catch {
    return DEFAULT_TABLE_COLUMN_PREFS;
  }
}

function writeTableColumnPrefs(tileId: string, prefs: TableColumnPrefs): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(tableColumnPrefsStorageKey(tileId), JSON.stringify(prefs));
  } catch {
    // best-effort — a private-browsing quota error must not break the tile
  }
}

/**
 * Ascending compare over a table cell's raw value. `WarehouseRow` values are
 * already typed `string | number | null` (unlike `sortLabels`'s numeric-
 * string dimension labels), so a genuine `number` short-circuits straight to
 * numeric compare; a missing/`null` value always sorts last regardless of
 * direction — the same "not yet observable" treatment `buildHeatmapView`
 * gives a missing cohort cell, rather than collapsing into a misleading `0`
 * or an arbitrary string-compare position.
 */
function compareColumnValues(a: string | number | null, b: string | number | null): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

function TableView({
  view,
  tileId,
  sessionReplayUrlTemplate,
}: {
  view: Extract<TileRenderView, { kind: 'table' }>;
  tileId: string;
  sessionReplayUrlTemplate?: string;
}): React.ReactElement {
  const t = useTranslations('Boards');
  const [prefs, setPrefs] = useState<TableColumnPrefs>(() => readTableColumnPrefs(tileId));
  const replayFiltersByPage = sessionReplayTemplateFiltersByPage(sessionReplayUrlTemplate);

  useEffect(() => {
    writeTableColumnPrefs(tileId, prefs);
  }, [tileId, prefs]);

  if (view.isEmpty) {
    return <p className="text-xs text-muted-foreground">{t('tableEmpty')}</p>;
  }

  const visibleColumns = view.columns.filter((column) => !prefs.hiddenColumns.includes(column));
  // Hiding every column would render a blank table indistinguishable from "no data" — always keep at least one.
  const columns = visibleColumns.length > 0 ? visibleColumns : view.columns;

  const sortColumn = prefs.sortColumn;
  const rows =
    sortColumn !== null && view.columns.includes(sortColumn)
      ? [...view.rows].sort((a, b) => {
          const compared = compareColumnValues(a[sortColumn] ?? null, b[sortColumn] ?? null);
          return prefs.sortDirection === 'desc' ? -compared : compared;
        })
      : view.rows;

  function toggleSort(column: string): void {
    setPrefs((current) => ({
      ...current,
      sortColumn: column,
      sortDirection: current.sortColumn === column && current.sortDirection === 'asc' ? 'desc' : 'asc',
    }));
  }

  function toggleColumnVisibility(column: string): void {
    setPrefs((current) => ({
      ...current,
      hiddenColumns: current.hiddenColumns.includes(column)
        ? current.hiddenColumns.filter((hidden) => hidden !== column)
        : [...current.hiddenColumns, column],
    }));
  }

  return (
    <div className="flex h-full flex-col gap-1">
      {view.columns.length > 1 ? (
        <details className="self-end text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground">{t('columnsMenuLabel')}</summary>
          <div className="absolute z-10 mt-1 flex flex-col gap-1 rounded-md border border-input bg-card p-2 shadow-md">
            {view.columns.map((column) => (
              <label key={column} className="flex items-center gap-1.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={!prefs.hiddenColumns.includes(column)}
                  onChange={() => toggleColumnVisibility(column)}
                  aria-label={t('showColumnLabel', { column })}
                />
                {column}
              </label>
            ))}
          </div>
        </details>
      ) : null}
      <div className="max-h-48 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sortColumn === column;
                return (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={isSorted ? (prefs.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="border-b border-input px-2 py-1 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="flex items-center gap-1 hover:text-primary"
                      aria-label={t('sortColumnLabel', { column })}
                    >
                      {column}
                      {isSorted ? <span aria-hidden="true">{prefs.sortDirection === 'asc' ? '▲' : '▼'}</span> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => {
                  const value = row[column] ?? '';
                  // Both kinds of template render an identical-looking link, so
                  // the tooltip is the only thing that can distinguish them. A
                  // template with no `{landing_page}` opens the same unfiltered
                  // page from every row, and must not claim to open "the
                  // recordings for this landing page" (KAN-160).
                  const replayLink = LANDING_PAGE_COLUMNS.has(column)
                    ? buildSessionReplayLink(sessionReplayUrlTemplate, String(value))
                    : null;
                  return (
                    <td key={column} className="border-b border-input px-2 py-1 tabular-nums">
                      {replayLink ? (
                        <a
                          href={replayLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t(replayFiltersByPage ? 'sessionReplayLinkTitle' : 'sessionReplayLinkTitleUnfiltered')}
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
export function BoardTileView({ tile, view, sessionReplayUrlTemplate }: BoardTileViewProps): React.ReactElement {
  const t = useTranslations('Boards');

  const content = (() => {
    switch (view.kind) {
      case 'unavailable':
        return <UnavailableView message={view.message} reasonLabel={t(`tileUnavailableReason.${view.reason}`)} />;
      case 'big_number':
        return <BigNumberView view={view} />;
      case 'time_series':
        return view.chart === 'line' ? <LineChartView view={view} title={tile.title} /> : <BarChartView view={view} title={tile.title} />;
      case 'table':
        return <TableView view={view} tileId={tile.id} sessionReplayUrlTemplate={sessionReplayUrlTemplate} />;
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
