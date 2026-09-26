import type {
  BoardModel,
  BoardTile,
  BoardTileQueryOutcome,
  BoardTileType,
  WarehouseRow,
} from '@growthos/firebase-orm-models';
import {
  DEFAULT_RELATIVE_DATE_RANGE,
  normalizeDateRangeSetting,
  readPeriodValue,
  resolveDateRangeSetting,
  todayUtcDateOnly,
  type ComparePeriod,
  type DateRangeSetting,
  type ParsedMetricUnit,
  type ResolvedDateRange,
} from '@growthos/shared';

/** A board's own list-page card — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface BoardSummaryView {
  id: string;
  name: string;
  tileCount: number;
  updatedAt: string;
}

export function toBoardSummaryView(board: BoardModel): BoardSummaryView {
  return { id: board.id, name: board.name, tileCount: board.tiles.length, updatedAt: board.updated_at };
}

/** A board's own settings (name/date range/compare/global filters) — the plain, serializable shape the grid editor + settings form operate on. */
export interface BoardView {
  id: string;
  name: string;
  /** The stored setting (KAN-211), normalized: always carries its `kind`, so a legacy `{ start, end, grain }` board arrives as `kind: 'absolute'`. */
  dateRange: DateRangeSetting;
  /** The concrete window `dateRange` means today (UTC) — what the tiles on the page were queried over. */
  resolvedDateRange: ResolvedDateRange;
  /** `undefined`, never `null` — this view's own conditional-spread construction (`toBoardView`) omits the key entirely rather than including an explicit `null` (unlike `BoardModel.compare` itself, whose stored `null` has its own storage-layer reason — see that field's own doc comment). */
  compare?: ComparePeriod;
  globalFilters: BoardModel['global_filters'];
  tiles: BoardTile[];
}

export function toBoardView(board: BoardModel, today: string = todayUtcDateOnly()): BoardView {
  const dateRange = normalizeDateRangeSetting(board.date_range) ?? { ...DEFAULT_RELATIVE_DATE_RANGE };
  return {
    id: board.id,
    name: board.name,
    dateRange,
    resolvedDateRange: resolveDateRangeSetting(dateRange, today),
    ...(board.compare ? { compare: board.compare } : {}),
    globalFilters: board.global_filters,
    tiles: board.tiles,
  };
}

export interface TimeSeriesPoint {
  bucket: string;
  /**
   * `null` is "no value" for this bucket — an avg/ratio/formula metric over a bucket with no events
   * (the query layer fills count/sum buckets with a real 0 instead, see `fillEmptyBuckets`). Charts
   * draw it as a gap and never interpolate across it; it is not a 0.
   */
  value: number | null;
}

export interface TimeSeries {
  label: string;
  points: TimeSeriesPoint[];
}

export interface FunnelStep {
  metricName: string;
  total: number;
  /** 0–100, relative to the first step's own total. */
  pctOfFirstStep: number;
}

/** Mirrors `BoardTileQueryOutcome`'s own `reason` union (`board.service.ts`) — not derived via a conditional type since that union is only ever seen through the `ok: false` branch, and spelling it out here is clearer than an `Extract<...>` gymnastic. */
export type BoardTileUnavailableReason = 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error';

/**
 * Data older than this renders its freshness badge as "stale" rather than
 * "fresh" (KAN-69, plan `13 §E13.2`: "killing a connector shows a stale
 * badge, not a blank board"). A full day, matching the daily cadence
 * orchestration runs (KAN-38) and most connector polling operate on today —
 * not configurable per-board/tile since there's no per-metric SLA concept
 * yet.
 */
export const TILE_STALE_THRESHOLD_HOURS = 24;

/** One tile's data-freshness badge state — `asOf` is the project-wide freshness timestamp (see `overallFreshnessAsOf` in `orchestration-view.ts`), `isStale` whether it's past {@link TILE_STALE_THRESHOLD_HOURS}. */
export interface TileFreshness {
  asOf: string;
  isStale: boolean;
}

/**
 * Resolves a raw "as of" timestamp (or `null` when no orchestration run has
 * ever succeeded for this project) into a tile's freshness badge state.
 * Takes `nowMs` as a parameter rather than reading `Date.now()` itself so
 * it's testable with a fixed clock — the same posture
 * `computeIngestHealthSummary` (KAN-35) already takes for its own
 * `freshnessMinutes` derivation.
 */
export function computeTileFreshness(asOf: string | null, nowMs: number = Date.now()): TileFreshness | null {
  if (asOf === null) {
    return null;
  }
  const ageMs = nowMs - new Date(asOf).getTime();
  return { asOf, isStale: ageMs >= TILE_STALE_THRESHOLD_HOURS * 60 * 60 * 1000 };
}

/** One `(rowLabels[i], columnLabels[j])` cell's value — `null` when that combination has no data (e.g. a period that hasn't happened yet for a younger cohort). */
export interface HeatmapView {
  rowLabels: string[];
  columnLabels: string[];
  matrix: (number | null)[][];
}

/** One `(label, value)` bar — `labels` sorted ascending (numeric-aware, see `sortLabels`), one per distinct breakdown-dimension value the query returned. */
export interface HistogramView {
  labels: string[];
  values: number[];
}

/** Every data-bearing tile kind carries the same two KAN-69 fields: whether its query returned zero rows (an "empty state", distinct from a genuine zero) and its project-wide data-freshness badge (`null` when no orchestration run has ever succeeded). `unavailable` carries neither — it's already its own degraded state with no queried data to attach either to. */
type WithFreshness<T> = T & {
  isEmpty: boolean;
  freshness: TileFreshness | null;
  /** The declared unit (KAN-213) of each of the tile's metrics that has one, by metric name. Absent when none of them declares a unit. */
  units?: MetricDisplayUnits;
};

/** Metric name -> the unit its values are displayed in (see `resolveMetricDisplayUnits`). */
export type MetricDisplayUnits = Record<string, ParsedMetricUnit>;

/**
 * The units a tile needs: only its own metrics, and only a declared unit - a plain `number` is left
 * out, so a tile over unit-less metrics renders exactly as it did before units existed.
 */
function tileUnits(tile: BoardTile, units: MetricDisplayUnits | undefined): MetricDisplayUnits | undefined {
  if (!units) {
    return undefined;
  }
  const picked = Object.fromEntries(
    tile.metricNames.flatMap((metricName) => {
      const unit = units[metricName];
      return unit && unit.kind !== 'number' ? [[metricName, unit] as const] : [];
    }),
  );
  return Object.keys(picked).length > 0 ? picked : undefined;
}

export type TileRenderView =
  | { kind: 'unavailable'; reason: BoardTileUnavailableReason; message: string }
  | WithFreshness<{ kind: 'big_number'; value: number; previousValue?: number; deltaPct?: number }>
  | WithFreshness<{ kind: 'time_series'; chart: Extract<BoardTileType, 'line' | 'bar'>; series: TimeSeries[]; previousSeries?: TimeSeries[] }>
  | WithFreshness<{ kind: 'table'; columns: string[]; rows: WarehouseRow[] }>
  | WithFreshness<{ kind: 'funnel'; steps: FunnelStep[] }>
  | WithFreshness<{ kind: 'heatmap' } & HeatmapView>
  | WithFreshness<{ kind: 'histogram' } & HistogramView>;

/** Coerces one warehouse cell to a finite number (`null`/unparseable reads 0). Exported for reuse by other view-mappers in this app that read the same `WarehouseRow[]` shape. */
export function toNumber(value: string | number | null): number {
  if (value === null) {
    return 0;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function splitByPeriod(rows: readonly WarehouseRow[]): { current: WarehouseRow[]; previous: WarehouseRow[] } {
  const current: WarehouseRow[] = [];
  const previous: WarehouseRow[] = [];
  for (const row of rows) {
    if (row.period === 'previous') {
      previous.push(row);
    } else {
      current.push(row);
    }
  }
  return { current, previous };
}

/**
 * A big number is its metric's value for the whole period. `queryBoardTile` asks the warehouse for
 * exactly that - the board's range as ONE bucket per period (`total` grain), with no breakdown - so
 * `rows` holds one row for the current period and, when compared, one for the previous. It is read
 * as-is, never re-derived from daily buckets: a conversion rate over the period is
 * sum(conversions) / sum(visitors), which neither the sum of its daily rates (thirty days at 5% is
 * not 150%) nor their mean (day 1 at 1/1 and day 2 at 1/100 average 50.5%, while the period's rate
 * is 2/101 = 1.98%) can recover. The same holds for an average and for a count_distinct (a customer
 * active on two days is one customer) - so a distinct-count big number can deliberately read LOWER
 * than the sum of the same metric's daily bars on a line/bar tile: the bars count each day's
 * distinct customers, the big number the period's. A count or a sum reads the same total it always
 * did.
 */
function buildBigNumberView(tile: BoardTile, rows: readonly WarehouseRow[]) {
  const metricName = tile.metricNames[0];
  const value = readPeriodValue(rows, metricName, 'current') ?? 0;
  if (!rows.some((row) => row.period === 'previous')) {
    return { kind: 'big_number' as const, value };
  }
  const previousValue = readPeriodValue(rows, metricName, 'previous') ?? 0;
  const deltaPct = previousValue !== 0 ? ((value - previousValue) / previousValue) * 100 : undefined;
  return { kind: 'big_number' as const, value, previousValue, ...(deltaPct !== undefined ? { deltaPct } : {}) };
}

/** A human-readable series label — display only, not used as the internal grouping key (see `groupKey`'s own doc comment for why). */
function groupLabel(row: WarehouseRow, dimensions: readonly string[]): string {
  if (dimensions.length === 0) {
    return 'all';
  }
  return dimensions.map((dimension) => String(row[dimension] ?? '')).join(' / ');
}

/**
 * The internal `Map` key one row's dimension-value combination groups
 * under — JSON-encoded (not the human-readable `' / '`-joined label a
 * dimension value could itself contain, e.g. a campaign name with a
 * literal "/" in it) so two genuinely different combinations can never
 * collide onto the same key and get silently merged into one series.
 */
function groupKey(row: WarehouseRow, dimensions: readonly string[]): string {
  return JSON.stringify(dimensions.map((dimension) => String(row[dimension] ?? '')));
}

function buildSeries(rows: readonly WarehouseRow[], tile: BoardTile): TimeSeries[] {
  const metricName = tile.metricNames[0];
  const byGroup = new Map<string, { label: string; points: TimeSeriesPoint[] }>();
  for (const row of rows) {
    const key = groupKey(row, tile.dimensions);
    const group = byGroup.get(key) ?? { label: groupLabel(row, tile.dimensions), points: [] };
    const raw = row[metricName] ?? null;
    group.points.push({ bucket: String(row.bucket_date ?? ''), value: raw === null ? null : toNumber(raw) });
    byGroup.set(key, group);
  }
  return [...byGroup.values()]
    .map((group) => ({ label: group.label, points: group.points.sort((a, b) => a.bucket.localeCompare(b.bucket)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildTimeSeriesView(tile: BoardTile, rows: readonly WarehouseRow[]) {
  const { current, previous } = splitByPeriod(rows);
  const chart: Extract<BoardTileType, 'line' | 'bar'> = tile.type === 'bar' ? 'bar' : 'line';
  return {
    kind: 'time_series' as const,
    chart,
    series: buildSeries(current, tile),
    ...(previous.length > 0 ? { previousSeries: buildSeries(previous, tile) } : {}),
  };
}

function buildTableView(rows: readonly WarehouseRow[]) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const sorted = [...rows].sort((a, b) => {
    const bucketCompare = String(a.bucket_date ?? '').localeCompare(String(b.bucket_date ?? ''));
    if (bucketCompare !== 0) {
      return bucketCompare;
    }
    return String(a.period ?? '').localeCompare(String(b.period ?? ''));
  });
  return { kind: 'table' as const, columns, rows: sorted };
}

/** Each step's value for the whole period - like a big number, a funnel tile queries one `total`-grain row (see `buildBigNumberView`). */
function buildFunnelView(tile: BoardTile, rows: readonly WarehouseRow[]) {
  const totals = tile.metricNames.map((metricName) => readPeriodValue(rows, metricName) ?? 0);
  const firstTotal = totals[0] ?? 0;
  const steps: FunnelStep[] = tile.metricNames.map((metricName, index) => ({
    metricName,
    total: totals[index],
    pctOfFirstStep: firstTotal > 0 ? (totals[index] / firstTotal) * 100 : 0,
  }));
  return { kind: 'funnel' as const, steps };
}

/** Ascending, numeric-aware when every label parses as a number (e.g. `period_number` values `"0"`, `"1"`, `"10"` — a plain string sort would put `"10"` before `"2"`); falls back to a locale string sort for non-numeric labels. */
function sortLabels(labels: readonly string[]): string[] {
  const numeric = labels.every((label) => label !== '' && Number.isFinite(Number(label)));
  return [...labels].sort(numeric ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b));
}

/**
 * A `cohort_month x <dimension>` matrix (KAN-62) — the board's own time
 * bucketing (`bucket_date`) supplies the row axis, the tile's one required
 * dimension supplies the column axis (see `BOARD_TILE_TYPES`'s own doc
 * comment in `board.model.ts` for why a heatmap reuses this shape instead
 * of a bespoke two-dimension query). A `(row, column)` combination absent
 * from `rows` — a period that hasn't elapsed yet for a younger cohort —
 * renders as `null`, not `0`: "not yet observable" is a different fact
 * than "observed and zero".
 */
function buildHeatmapView(tile: BoardTile, rows: readonly WarehouseRow[]) {
  const metricName = tile.metricNames[0];
  const dimension = tile.dimensions[0];
  const rowLabels = sortLabels([...new Set(rows.map((row) => String(row.bucket_date ?? '')))]);
  const columnLabels = sortLabels([...new Set(rows.map((row) => String(row[dimension] ?? '')))]);
  // JSON-encoded, not a plain string join with a literal separator -- the
  // same delimiter-collision reasoning groupKey's own doc comment gives (a
  // row/column label could itself contain whatever plain separator this
  // used).
  const cellKey = (rowLabel: string, columnLabel: string) => JSON.stringify([rowLabel, columnLabel]);
  const valueByKey = new Map<string, number>();
  for (const row of rows) {
    valueByKey.set(cellKey(String(row.bucket_date ?? ''), String(row[dimension] ?? '')), toNumber(row[metricName] ?? null));
  }
  const matrix = rowLabels.map((rowLabel) => columnLabels.map((columnLabel) => valueByKey.get(cellKey(rowLabel, columnLabel)) ?? null));
  return { kind: 'heatmap' as const, rowLabels, columnLabels, matrix };
}

/**
 * A one-dimension bar chart (KAN-63) — e.g. `days_active_bucket x
 * engagement_depth_histogram`, the same "one metric, one breakdown
 * dimension" query shape `heatmap` already established, just collapsed to a
 * single axis instead of a matrix: every row is summed into its own
 * dimension-value bucket (there should only ever be one row per bucket for
 * a real "as of latest date" snapshot metric, but summing rather than
 * overwriting tolerates a query that happens to return more than one - right
 * for the additive snapshot counts a histogram draws).
 */
function buildHistogramView(tile: BoardTile, rows: readonly WarehouseRow[]) {
  const metricName = tile.metricNames[0];
  const dimension = tile.dimensions[0];
  const valueByLabel = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[dimension] ?? '');
    valueByLabel.set(label, (valueByLabel.get(label) ?? 0) + toNumber(row[metricName] ?? null));
  }
  const labels = sortLabels([...valueByLabel.keys()]);
  return { kind: 'histogram' as const, labels, values: labels.map((label) => valueByLabel.get(label) ?? 0) };
}

/**
 * Turns one tile's raw `queryBoardTile` outcome into the shape its
 * type-specific renderer consumes — grouping/summing/sorting the flat
 * `WarehouseRow[]` series so no rendering component needs to know about
 * `bucket_date`/`period` column conventions itself. An unavailable outcome
 * (warehouse not configured, quota exceeded, a query error) passes straight
 * through as its own render kind so the grid can show a per-tile degraded
 * state instead of failing the whole board (plan `10 §2.6`'s "never a blank
 * board", applied per-tile — see `queryBoardTile`'s own doc comment).
 *
 * `freshness` (KAN-69, plan `13 §E13.2`) is the project-wide data-freshness
 * badge state every successfully-queried tile shares — see
 * `computeTileFreshness`'s own doc comment for why one shared value covers
 * every tile rather than a per-metric one. Omitted (`null`) by callers that
 * haven't computed it (e.g. existing tests), which simply renders no badge.
 * `isEmpty` (the query succeeded but returned zero rows, as opposed to a
 * genuine zero) is derived here once for every kind, rather than each
 * type-specific renderer re-deriving it from its own already-shaped data.
 */
/** Distributive, so omitting the two wrapper fields keeps the union's members (and its `kind` discriminant) intact instead of collapsing them to their common keys. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type TileContent = DistributiveOmit<
  Extract<TileRenderView, { kind: Exclude<TileRenderView['kind'], 'unavailable'> }>,
  'isEmpty' | 'freshness'
>;

/**
 * Whether a shaped tile holds anything to draw — see `buildTileRenderView` for why this is
 * derived from the content rather than the query's row count.
 *
 * `big_number` and `funnel` are the exceptions and take `currentRowCount` instead: their
 * shape comes from the tile's own configuration, not from the data. A funnel always emits one
 * step per configured metric and a big number always emits a value, so both look non-empty
 * even when nothing was returned. For those two, "did the current period return any rows"
 * is the only question that distinguishes an unmeasured tile from a genuine zero.
 */
function contentIsEmpty(content: TileContent, currentRowCount: number): boolean {
  switch (content.kind) {
    case 'big_number':
    case 'funnel':
      return currentRowCount === 0;
    case 'time_series':
      // A series of nothing but gaps (every bucket "no value") has nothing to draw either.
      return content.series.length === 0 || content.series.every((series) => series.points.every((point) => point.value === null));
    case 'table':
      return content.rows.length === 0;
    case 'heatmap':
      return content.rowLabels.length === 0 || content.columnLabels.length === 0;
    case 'histogram':
      return content.labels.length === 0;
  }
}

export function buildTileRenderView(
  tile: BoardTile,
  outcome: BoardTileQueryOutcome,
  freshness: TileFreshness | null = null,
  units?: MetricDisplayUnits,
): TileRenderView {
  if (!outcome.ok) {
    return { kind: 'unavailable', reason: outcome.reason, message: outcome.message };
  }
  const content = (() => {
    switch (tile.type) {
      case 'big_number':
        return buildBigNumberView(tile, outcome.series);
      case 'line':
      case 'bar':
        return buildTimeSeriesView(tile, outcome.series);
      case 'table':
        return buildTableView(outcome.series);
      case 'funnel':
        return buildFunnelView(tile, outcome.series);
      case 'heatmap':
        return buildHeatmapView(tile, outcome.series);
      case 'histogram':
        return buildHistogramView(tile, outcome.series);
      default:
        return buildTableView(outcome.series);
    }
  })();

  /*
    Emptiness is decided by what the tile can actually draw, not by the raw row count.

    It used to be `outcome.series.length === 0`. But every chart kind renders from a *subset*
    of those rows: `buildTimeSeriesView` splits by `period` and charts only the current one,
    so a tile whose rows were all `period: 'previous'` produced `series: []` while the row
    count said "not empty". `LineChartView` and `BarChartView` then skipped their empty branch
    and rendered an `<svg>` with no polylines, or a flex container with no bars — a blank box
    with no explanation, on a tile whose query had succeeded.

    That is the reported symptom exactly: on the Landing-page board the big-number and
    breakdown tiles came up blank while the table tile, which renders every row regardless of
    period, showed the same underlying data correctly.

    Big numbers and funnels are judged on the current period's row count instead, because
    their shape is configuration-driven rather than data-driven — see `contentIsEmpty`.
  */
  const isEmpty = contentIsEmpty(content, splitByPeriod(outcome.series).current.length);

  const displayUnits = tileUnits(tile, units);
  return { ...content, isEmpty, freshness, ...(displayUnits ? { units: displayUnits } : {}) };
}
