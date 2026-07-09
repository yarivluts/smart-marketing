// Client components must never import from `@growthos/firebase-orm-models`
// (its barrel drags in server-only code, e.g. `node:crypto` from
// `key.service.ts`, which breaks the client webpack bundle) — this file is
// the board feature's own local copy of the small bits of that package's
// vocabulary a board's grid editor needs, the same reasoning
// `metric-definition-editor.tsx`'s own `METRIC_AGG_FUNCTIONS` local copy
// documents for its own case.

export const BOARD_TILE_TYPES = ['line', 'bar', 'big_number', 'table', 'funnel'] as const;
export type BoardTileTypeRow = (typeof BOARD_TILE_TYPES)[number];

export const BOARD_GRID_COLUMNS = 12;

export const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type TimeGrainRow = (typeof TIME_GRAINS)[number];

export const COMPARE_PERIODS = ['previous_period', 'previous_year'] as const;
export type ComparePeriodRow = (typeof COMPARE_PERIODS)[number];

export const METRIC_FILTER_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'in'] as const;
export type MetricFilterOperatorRow = (typeof METRIC_FILTER_OPERATORS)[number];

export interface BoardTileLayoutRow {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A plain, client-safe mirror of `BoardTile` (`@growthos/firebase-orm-models`, see this file's own doc comment for why it isn't imported directly). */
export interface BoardTileRow {
  id: string;
  type: BoardTileTypeRow;
  title: string;
  layout: BoardTileLayoutRow;
  metricNames: string[];
  dimensions: string[];
}

/** A plain mirror of `MetricCatalogEntry` — the shape the tile editor's metric picker reads from. */
export interface MetricCatalogEntryRow {
  name: string;
  dimensions: string[];
}

export interface GlobalFilterRow {
  field: string;
  operator: MetricFilterOperatorRow;
  value: string;
}

/** Default size (in grid columns/rows) for a newly added tile of each type — big numbers are small, everything else needs room for a chart/table/steps. */
export function defaultTileSize(type: BoardTileTypeRow): { w: number; h: number } {
  return type === 'big_number' ? { w: 3, h: 2 } : { w: 6, h: 4 };
}

/** The next free row below every existing tile, for a newly added tile's default `y` — simple "append at the bottom" placement rather than packing into gaps, the same buildable-today posture this codebase's other v1 features take over a full bin-packing algorithm. */
export function nextTileRow(tiles: readonly BoardTileRow[]): number {
  return tiles.reduce((maxBottom, tile) => Math.max(maxBottom, tile.layout.y + tile.layout.h), 0);
}
