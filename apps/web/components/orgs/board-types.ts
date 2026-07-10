// Client components must never import from `@growthos/firebase-orm-models`
// (its barrel drags in server-only code, e.g. `node:crypto` from
// `key.service.ts`, which breaks the client webpack bundle) — `BOARD_TILE_
// TYPES`/`BoardTileTypeRow` below is this board feature's own local copy of
// the one bit of that package's vocabulary a board's grid editor needs
// (`BoardTileType` only exists there), the same reasoning `metric-
// definition-editor.tsx`'s own `METRIC_AGG_FUNCTIONS` local copy documents
// for its own case.
//
// `@growthos/shared` is a different, Firestore-free package with no such
// restriction — `parse-board-fields.ts` and the pre-existing `invite-
// member-form.tsx` ('use client') both already import real values
// (`TIME_GRAINS`/`COMPARE_PERIODS`/`METRIC_FILTER_OPERATORS`/`CompilerFilter`,
// `INVITABLE_ROLES`) from it directly, so re-declaring those same three
// vocabularies here too would just be a second copy to keep in sync by
// hand — re-exported from there instead.
export { TIME_GRAINS, COMPARE_PERIODS, METRIC_FILTER_OPERATORS } from '@growthos/shared';
export type { TimeGrain as TimeGrainRow, ComparePeriod as ComparePeriodRow, MetricFilterOperator as MetricFilterOperatorRow, CompilerFilter as GlobalFilterRow } from '@growthos/shared';

export const BOARD_TILE_TYPES = ['line', 'bar', 'big_number', 'table', 'funnel', 'heatmap'] as const;
export type BoardTileTypeRow = (typeof BOARD_TILE_TYPES)[number];

export const BOARD_GRID_COLUMNS = 12;

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
  /** Only used by a `heatmap` tile (KAN-62) — see `BoardTile.cohortConversionEvent`'s own doc comment. */
  cohortConversionEvent?: string;
}

/** A plain mirror of `MetricCatalogEntry` — the shape the tile editor's metric picker reads from. */
export interface MetricCatalogEntryRow {
  name: string;
  dimensions: string[];
}

/** Default size (in grid columns/rows) for a newly added tile of each type — big numbers are small, a heatmap needs a little extra height for its cohort-month rows, everything else needs room for a chart/table/steps. */
export function defaultTileSize(type: BoardTileTypeRow): { w: number; h: number } {
  if (type === 'big_number') {
    return { w: 3, h: 2 };
  }
  if (type === 'heatmap') {
    return { w: 6, h: 5 };
  }
  return { w: 6, h: 4 };
}

/** The next free row below every existing tile, for a newly added tile's default `y` — simple "append at the bottom" placement rather than packing into gaps, the same buildable-today posture this codebase's other v1 features take over a full bin-packing algorithm. */
export function nextTileRow(tiles: readonly BoardTileRow[]): number {
  return tiles.reduce((maxBottom, tile) => Math.max(maxBottom, tile.layout.y + tile.layout.h), 0);
}
