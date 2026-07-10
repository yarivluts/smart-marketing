import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { ComparePeriod, CompilerFilter, TimeGrain } from '@growthos/shared';

/**
 * The task-breakdown AC's own tile-type list (plan `13 §E11.2`: "tile types
 * (line/bar/big-number/table/funnel)") — a deliberately smaller vocabulary
 * than `10-product-ux.md §2.2`'s fuller wishlist (area/cohort-heatmap/pie/
 * map/AI-note/iframe), the same "AC over wishlist" scoping every prior
 * KAN-3x/4x story in this codebase already applied to its own spec section.
 * `heatmap` (KAN-62) is the first addition past that original five — a
 * cohort_month x period_number matrix, plugged into this same "one metric,
 * time-bucketed, broken down by dimensions" query shape rather than a
 * bespoke two-dimension query of its own: its one required dimension (see
 * `validateTiles` in `board.service.ts`) supplies the matrix's *column*
 * axis (e.g. `period_number`), while the board's own time bucketing
 * (already every other tile type's row/x-axis) supplies the matrix's *row*
 * axis — a metric registered against `fact_cohort_retention` with
 * `timeColumn: 'cohort_month'` buckets naturally into one row per cohort
 * month. `validateTiles`/`updateBoardSettings` both enforce that a board
 * with a `heatmap` tile keeps its date-range `grain` at `'month'` — a
 * coarser grain would `DATE_TRUNC` multiple distinct cohort months into the
 * same bucket, silently blending distinct cohorts into one matrix row.
 */
export const BOARD_TILE_TYPES = ['line', 'bar', 'big_number', 'table', 'funnel', 'heatmap'] as const;
export type BoardTileType = (typeof BOARD_TILE_TYPES)[number];

export function isBoardTileType(value: string): value is BoardTileType {
  return (BOARD_TILE_TYPES as readonly string[]).includes(value);
}

/** Grid width in columns — a conventional 12-column responsive grid. */
export const BOARD_GRID_COLUMNS = 12;

/** A tile's position + size within the board's grid, in grid units (not pixels) — `x`/`w` in columns, `y`/`h` in rows. */
export interface BoardTileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One tile on a board. Embedded directly on {@link BoardModel} (an array
 * field) rather than a separate per-tile Firestore collection — a board's
 * tiles are always read/written together (the whole layout is what
 * "persists" per the AC), the same "array of nested config objects on one
 * document" shape `MetricDefModel.aggregation`/`SchemaDefModel.field_defs`
 * already use for their own always-read-together nested config.
 */
export interface BoardTile {
  /** Client-generated (uuid-shaped) — stable across saves so drag/resize edits can target one tile without the whole array being positionally re-indexed. */
  id: string;
  type: BoardTileType;
  title: string;
  layout: BoardTileLayout;
  /**
   * Registered metric name(s) this tile queries (must exist in the
   * project's active metric catalog — enforced at save time, see
   * `board.service.ts`'s `saveBoardTiles`). Every tile type reads exactly
   * one metric except `funnel`, which reads two or more — its ordered
   * steps.
   */
  metricNames: string[];
  /** Breakdown dimension(s), each must be one of the tile's metric's own registered dimensions (enforced at query time by the compiler, KAN-41). Ignored by `funnel` (breaks down by step, not by dimension) and `big_number` (a single total has nothing to break down by). */
  dimensions: string[];
}

export interface BoardDateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
  grain: TimeGrain;
}

/**
 * A dashboard board (plan `13 §E11.2`, `10 §2.2`): a named, project-scoped
 * grid of tiles with a board-level date range + compare period + global
 * filters applied to every tile's query in addition to that tile's own
 * dimension breakdown (plan `10 §2.2`: "Board-level: date range, global
 * filters"). Real per-tile data comes from KAN-42's `queryMetrics` at
 * render time — this model stores only the board's own config (what to
 * query, not the query result), the same "config in Firestore, data from
 * the warehouse" split every other admin surface in this codebase (metric
 * defs, schema defs) already follows.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/boards',
  path_id: 'board_id',
})
export class BoardModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public tiles!: BoardTile[];

  @Field({ is_required: true })
  public date_range!: BoardDateRange;

  /**
   * `null` (not `undefined`) is this field's own honest "no compare period"
   * value — always assigned explicitly (never left unset), for the same
   * reason `PluginSourceRunModel.cursor_before` (KAN-47) is: `@arbel/
   * firebase-orm`'s `getDocumentData()` omits any field whose value is
   * `undefined` from the object it hands to Firestore's `updateDoc()`,
   * which leaves the *previously stored* value untouched rather than
   * clearing it — an explicit `null` is a real value that overwrites it.
   * Deliberately `is_required: false` despite always being assigned:
   * `verifyRequiredFields()` treats `null` the same as "missing" for a
   * *required* field and silently skips the whole `save()` call (the exact
   * bug that story found for `cursor_before`) — `is_required: false` opts
   * this field out of that check regardless of its value.
   */
  @Field({ is_required: false })
  public compare!: ComparePeriod | null;

  @Field({ is_required: true })
  public global_filters!: CompilerFilter[];

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: true })
  public updated_by!: string;

  @Field({ is_required: true })
  public updated_at!: string;
}
