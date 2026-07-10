import type {
  BoardModel,
  BoardTile,
  BoardTileQueryOutcome,
  BoardTileType,
  WarehouseRow,
} from '@growthos/firebase-orm-models';
import type { ComparePeriod } from '@growthos/shared';

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
  dateRange: BoardModel['date_range'];
  /** `undefined`, never `null` — this view's own conditional-spread construction (`toBoardView`) omits the key entirely rather than including an explicit `null` (unlike `BoardModel.compare` itself, whose stored `null` has its own storage-layer reason — see that field's own doc comment). */
  compare?: ComparePeriod;
  globalFilters: BoardModel['global_filters'];
  tiles: BoardTile[];
}

export function toBoardView(board: BoardModel): BoardView {
  return {
    id: board.id,
    name: board.name,
    dateRange: board.date_range,
    ...(board.compare ? { compare: board.compare } : {}),
    globalFilters: board.global_filters,
    tiles: board.tiles,
  };
}

export interface TimeSeriesPoint {
  bucket: string;
  value: number;
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
export type BoardTileUnavailableReason = 'warehouse_not_configured' | 'quota_exceeded' | 'query_error';

/** One `(rowLabels[i], columnLabels[j])` cell's value — `null` when that combination has no data (e.g. a period that hasn't happened yet for a younger cohort). */
export interface HeatmapView {
  rowLabels: string[];
  columnLabels: string[];
  matrix: (number | null)[][];
}

export type TileRenderView =
  | { kind: 'unavailable'; reason: BoardTileUnavailableReason; message: string }
  | { kind: 'big_number'; value: number; previousValue?: number; deltaPct?: number }
  | { kind: 'time_series'; chart: Extract<BoardTileType, 'line' | 'bar'>; series: TimeSeries[]; previousSeries?: TimeSeries[] }
  | { kind: 'table'; columns: string[]; rows: WarehouseRow[] }
  | { kind: 'funnel'; steps: FunnelStep[] }
  | ({ kind: 'heatmap' } & HeatmapView);

function toNumber(value: string | number | null): number {
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

function sumMetric(rows: readonly WarehouseRow[], metricName: string): number {
  return rows.reduce((total, row) => total + toNumber(row[metricName] ?? null), 0);
}

function buildBigNumberView(tile: BoardTile, rows: readonly WarehouseRow[]): TileRenderView {
  const metricName = tile.metricNames[0];
  const { current, previous } = splitByPeriod(rows);
  const value = sumMetric(current, metricName);
  if (previous.length === 0) {
    return { kind: 'big_number', value };
  }
  const previousValue = sumMetric(previous, metricName);
  const deltaPct = previousValue !== 0 ? ((value - previousValue) / previousValue) * 100 : undefined;
  return { kind: 'big_number', value, previousValue, ...(deltaPct !== undefined ? { deltaPct } : {}) };
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
    group.points.push({ bucket: String(row.bucket_date ?? ''), value: toNumber(row[metricName] ?? null) });
    byGroup.set(key, group);
  }
  return [...byGroup.values()]
    .map((group) => ({ label: group.label, points: group.points.sort((a, b) => a.bucket.localeCompare(b.bucket)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildTimeSeriesView(tile: BoardTile, rows: readonly WarehouseRow[]): TileRenderView {
  const { current, previous } = splitByPeriod(rows);
  const chart = tile.type === 'bar' ? 'bar' : 'line';
  return {
    kind: 'time_series',
    chart,
    series: buildSeries(current, tile),
    ...(previous.length > 0 ? { previousSeries: buildSeries(previous, tile) } : {}),
  };
}

function buildTableView(rows: readonly WarehouseRow[]): TileRenderView {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const sorted = [...rows].sort((a, b) => {
    const bucketCompare = String(a.bucket_date ?? '').localeCompare(String(b.bucket_date ?? ''));
    if (bucketCompare !== 0) {
      return bucketCompare;
    }
    return String(a.period ?? '').localeCompare(String(b.period ?? ''));
  });
  return { kind: 'table', columns, rows: sorted };
}

function buildFunnelView(tile: BoardTile, rows: readonly WarehouseRow[]): TileRenderView {
  const totals = tile.metricNames.map((metricName) => sumMetric(rows, metricName));
  const firstTotal = totals[0] ?? 0;
  const steps: FunnelStep[] = tile.metricNames.map((metricName, index) => ({
    metricName,
    total: totals[index],
    pctOfFirstStep: firstTotal > 0 ? (totals[index] / firstTotal) * 100 : 0,
  }));
  return { kind: 'funnel', steps };
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
function buildHeatmapView(tile: BoardTile, rows: readonly WarehouseRow[]): TileRenderView {
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
  return { kind: 'heatmap', rowLabels, columnLabels, matrix };
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
 */
export function buildTileRenderView(tile: BoardTile, outcome: BoardTileQueryOutcome): TileRenderView {
  if (!outcome.ok) {
    return { kind: 'unavailable', reason: outcome.reason, message: outcome.message };
  }
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
    default:
      return buildTableView(outcome.series);
  }
}
