import type { ComparePeriod, CompilerFilter, MetricQueryRequest } from '@growthos/shared';
import { MetricCompilerError } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import {
  BOARD_GRID_COLUMNS,
  BoardModel,
  isBoardTileType,
  type BoardDateRange,
  type BoardTile,
} from '../models/board.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { listMetricsCatalogForProject, queryMetrics, type MetricCatalogEntry } from './metrics-query.service';
import { MetricNotRegisteredError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { WarehouseNotConfiguredError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import type { MetricQueryResultCache } from '../warehouse/result-cache';

export class InvalidBoardError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid board: ${reasons.join('; ')}`);
    this.name = 'InvalidBoardError';
  }
}

export class BoardNotFoundError extends Error {
  constructor() {
    super('No board with this id exists in this project.');
    this.name = 'BoardNotFoundError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** The board's own doc, scoped and existence-checked — the same `.init` + field-match pattern every other project-child lookup in this package uses (`loadApiKey`, `requirePluginInstallInProject`, ...). */
async function loadBoard(organizationId: string, projectId: string, boardId: string): Promise<BoardModel> {
  const board = await BoardModel.init(boardId, { organization_id: organizationId, project_id: projectId });
  if (!board || board.organization_id !== organizationId || board.project_id !== projectId) {
    throw new BoardNotFoundError();
  }
  return board;
}

/** A trailing 30-day window ending today — a reasonable default for a brand-new board, the same "a human can change it immediately" posture `DEFAULT_DAILY_QUERY_LIMIT` (KAN-39) takes for its own default. */
function defaultDateRange(): BoardDateRange {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
  return { start: toDateOnly(start), end: toDateOnly(end), grain: 'day' };
}

export interface CreateBoardParams {
  organizationId: string;
  projectId: string;
  name: string;
  createdByUserId: string;
}

/** Creates an empty board (no tiles yet) with a default trailing-30-day date range — the AC's "build a board ... without code" starting point. */
export async function createBoard(params: CreateBoardParams): Promise<BoardModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const name = params.name.trim();
  if (name.length === 0) {
    throw new InvalidBoardError(['A board must have a non-empty name.']);
  }

  const now = new Date().toISOString();
  const board = new BoardModel();
  board.organization_id = params.organizationId;
  board.project_id = params.projectId;
  board.name = name;
  board.tiles = [];
  board.date_range = defaultDateRange();
  board.compare = null;
  board.global_filters = [];
  board.created_by = params.createdByUserId;
  board.created_at = now;
  board.updated_by = params.createdByUserId;
  board.updated_at = now;
  board.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await board.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'board.create',
      targetType: 'board',
      targetId: board.id,
      summary: `Created board "${board.name}"`,
    });
  } catch {
    // Best-effort — audit logging must never turn a successful create into a failure for the caller.
  }

  return board;
}

/** Every board in a project, name-sorted. */
export async function listBoardsForProject(organizationId: string, projectId: string): Promise<BoardModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const boards = await BoardModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return boards.sort((a, b) => a.name.localeCompare(b.name));
}

/** One board, or `null` if it doesn't exist / doesn't belong to this org+project — the 404-not-403 shape a page/route maps to a `notFound()`/404 response. */
export async function getBoard(organizationId: string, projectId: string, boardId: string): Promise<BoardModel | null> {
  try {
    return await loadBoard(organizationId, projectId, boardId);
  } catch (error) {
    if (error instanceof BoardNotFoundError) {
      return null;
    }
    throw error;
  }
}

export interface UpdateBoardSettingsParams {
  organizationId: string;
  projectId: string;
  boardId: string;
  name?: string;
  dateRange?: BoardDateRange;
  compare?: ComparePeriod | null;
  globalFilters?: CompilerFilter[];
  updatedByUserId: string;
}

/** Renames a board and/or updates its board-level date range, compare period, and global filters (plan `10 §2.2`: "Board-level: date range, global filters"). Every field is optional so a caller can update just one without re-sending the rest. */
export async function updateBoardSettings(params: UpdateBoardSettingsParams): Promise<BoardModel> {
  const board = await loadBoard(params.organizationId, params.projectId, params.boardId);

  if (params.name !== undefined) {
    const name = params.name.trim();
    if (name.length === 0) {
      throw new InvalidBoardError(['A board must have a non-empty name.']);
    }
    board.name = name;
  }
  if (params.dateRange !== undefined) {
    if (params.dateRange.start > params.dateRange.end) {
      throw new InvalidBoardError(['The date range start must not be after its end.']);
    }
    board.date_range = params.dateRange;
  }
  if (params.compare !== undefined) {
    // Assigns a real `null`, never `undefined` — see `BoardModel.compare`'s
    // own doc comment for why `undefined` would silently fail to clear a
    // previously-set compare period in Firestore.
    board.compare = params.compare;
  }
  if (params.globalFilters !== undefined) {
    board.global_filters = params.globalFilters;
  }
  board.updated_by = params.updatedByUserId;
  board.updated_at = new Date().toISOString();
  await board.save();
  return board;
}

function validateTiles(tiles: readonly BoardTile[], catalog: readonly MetricCatalogEntry[]): void {
  const reasons: string[] = [];
  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
  const seenIds = new Set<string>();

  for (const tile of tiles) {
    if (!tile.id || tile.id.trim().length === 0) {
      reasons.push('Every tile must have a non-empty id.');
    } else if (seenIds.has(tile.id)) {
      reasons.push(`Tile id "${tile.id}" is used more than once.`);
    } else {
      seenIds.add(tile.id);
    }

    if (!isBoardTileType(tile.type)) {
      reasons.push(`Tile "${tile.id}" has an unknown type "${tile.type}".`);
      continue;
    }
    if (!tile.title || tile.title.trim().length === 0) {
      reasons.push(`Tile "${tile.id}" must have a non-empty title.`);
    }

    const { x, y, w, h } = tile.layout;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(w) || !Number.isInteger(h) || x < 0 || y < 0 || w < 1 || h < 1) {
      reasons.push(`Tile "${tile.id}" has an invalid layout.`);
    } else if (x + w > BOARD_GRID_COLUMNS) {
      reasons.push(`Tile "${tile.id}" extends past the ${BOARD_GRID_COLUMNS}-column grid.`);
    }

    const minMetrics = tile.type === 'funnel' ? 2 : 1;
    const maxMetrics = tile.type === 'funnel' ? Infinity : 1;
    if (tile.metricNames.length < minMetrics || tile.metricNames.length > maxMetrics) {
      reasons.push(
        tile.type === 'funnel'
          ? `Funnel tile "${tile.id}" needs at least two metrics (its ordered steps).`
          : `Tile "${tile.id}" must reference exactly one metric.`,
      );
    }

    if (tile.type === 'heatmap' && tile.dimensions.length !== 1) {
      reasons.push(`Heatmap tile "${tile.id}" needs exactly one breakdown dimension (its matrix's column axis).`);
    }

    for (const metricName of tile.metricNames) {
      const entry = catalogByName.get(metricName);
      if (!entry) {
        reasons.push(`Tile "${tile.id}" references unregistered (or non-active) metric "${metricName}".`);
        continue;
      }
      for (const dimension of tile.dimensions) {
        if (!entry.dimensions.includes(dimension)) {
          reasons.push(`Tile "${tile.id}" requests dimension "${dimension}", which metric "${metricName}" doesn't declare.`);
        }
      }
    }
  }

  if (reasons.length > 0) {
    throw new InvalidBoardError(reasons);
  }
}

export interface SaveBoardTilesParams {
  organizationId: string;
  projectId: string;
  boardId: string;
  tiles: BoardTile[];
  updatedByUserId: string;
}

/**
 * Replaces a board's entire `tiles` array in one write (KAN-60 AC: "layout
 * persists"). Every add/move/resize/edit/remove a non-engineer makes in the
 * grid editor is staged client-side and saved as one full-array replace
 * rather than N per-tile Firestore writes — the same "whole config array,
 * not per-element mutation" shape `config_schema` (KAN-46) and `field_defs`
 * (KAN-31) already use for their own embedded-array fields, and it sidesteps
 * needing an atomic array-element-update primitive this package doesn't have
 * (raw Firestore SDK access is reserved to `firestore-connection.ts`, see
 * `registerSchemaDefinition`'s own doc comment).
 */
export async function saveBoardTiles(params: SaveBoardTilesParams): Promise<BoardModel> {
  const board = await loadBoard(params.organizationId, params.projectId, params.boardId);
  const catalog = await listMetricsCatalogForProject(params.organizationId, params.projectId);
  validateTiles(params.tiles, catalog);

  board.tiles = params.tiles;
  board.updated_by = params.updatedByUserId;
  board.updated_at = new Date().toISOString();
  await board.save();
  return board;
}

/** Deletes a board outright — unlike most lifecycle models in this codebase (plugin installs, resource attachments), a board is disposable user content with no audit-trail requirement of its own; it isn't a security- or billing-relevant resource, so nothing depends on its history surviving deletion. */
export async function deleteBoard(organizationId: string, projectId: string, boardId: string): Promise<void> {
  const board = await loadBoard(organizationId, projectId, boardId);
  await board.delete();
}

export type BoardTileQueryOutcome =
  | { ok: true; series: WarehouseRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

export interface QueryBoardTileParams {
  organizationId: string;
  projectId: string;
  board: Pick<BoardModel, 'date_range' | 'compare' | 'global_filters'>;
  tile: BoardTile;
  executor?: WarehouseQueryExecutor;
  cache?: MetricQueryResultCache;
}

/**
 * Resolves + runs one tile's own metric query (its metric(s) + dimension
 * breakdown, combined with the board's date range, compare period, and
 * global filters — plan `10 §2.2`: every tile has "metric picker from the
 * semantic layer" plus "period compare, dimension breakdown"). Never throws
 * for an expected, per-tile-recoverable outcome — `WarehouseNotConfiguredError`
 * (no BigQuery project until KAN-18), a `ProjectQueryQuotaExceededError`, or
 * any other compiler/executor error — so one broken/unconfigured tile
 * degrades gracefully instead of failing the whole board render (`10 §2.6`
 * / `13 §E13.2`'s "never a blank board" posture, applied at the single-tile
 * grain here since KAN-69 itself is a later story).
 *
 * Known, deliberately deferred inefficiency: the board detail page fans this
 * out once per tile via `Promise.all`, and each call independently re-reads
 * the project doc, the cost-quota config, and any metric definitions this
 * tile shares with a sibling tile — a board with N tiles referencing M
 * distinct metrics does more Firestore reads than the minimum (one project
 * read, one quota check, M metric reads) a batched version could. Fixing
 * this properly means threading precomputed project/quota/catalog state
 * through `queryMetrics`/`compileMetricQueryForProject`, which are also
 * `POST /v1/metrics/query`'s (KAN-42) own call path — out of scope for this
 * story to change; the same "documented, not fixed" posture `cost-guardrail.
 * service.ts`'s own non-transactional-quota-check gap already takes.
 */
export async function queryBoardTile(params: QueryBoardTileParams): Promise<BoardTileQueryOutcome> {
  // `compare` (a "vs. previous period" overlay) is excluded for `heatmap`
  // alongside `funnel` — a cohort matrix's rows are already "cohort month",
  // its own kind of time axis, so a second doubled-up period wouldn't
  // overlay onto the same matrix cleanly the way it does for a line/bar
  // series.
  const supportsCompare = params.tile.type !== 'funnel' && params.tile.type !== 'heatmap';
  const request: MetricQueryRequest = {
    metrics: params.tile.metricNames,
    ...(params.tile.type === 'funnel' ? {} : { dimensions: params.tile.dimensions }),
    ...(params.board.global_filters.length > 0 ? { filters: params.board.global_filters } : {}),
    time: {
      start: params.board.date_range.start,
      end: params.board.date_range.end,
      grain: params.board.date_range.grain,
      ...(supportsCompare && params.board.compare ? { compare: params.board.compare } : {}),
    },
  };

  try {
    const result = await queryMetrics({
      organizationId: params.organizationId,
      projectId: params.projectId,
      request,
      ...(params.executor ? { executor: params.executor } : {}),
      ...(params.cache ? { cache: params.cache } : {}),
    });
    return { ok: true, series: result.series };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    // Every other *expected* failure mode `queryMetrics` itself documents
    // throwing (see its own doc comment): an invalid/incompatible request
    // against the current catalog, or whatever the executor threw once past
    // the two checks above. Deliberately does NOT fall back to a blanket
    // `error instanceof Error` — that would also swallow a genuine bug
    // (e.g. a `TypeError` from a coding error elsewhere in the compile
    // path) into this same silent per-tile "couldn't load" state with no
    // signal to notice it. An unrecognized error rethrows instead, so it
    // surfaces as a real failure on the board page rather than a
    // convincingly-normal-looking degraded tile.
    if (error instanceof MetricCompilerError || error instanceof ProjectNotFoundError || error instanceof MetricNotRegisteredError) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}
