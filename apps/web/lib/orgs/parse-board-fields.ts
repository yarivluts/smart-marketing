import { NextResponse, type NextRequest } from 'next/server';
import { COMPARE_PERIODS, METRIC_FILTER_OPERATORS, TIME_GRAINS, type CompilerFilter, type ComparePeriod, type TimeGrain } from '@growthos/shared';
import type { BoardTile, BoardTileType } from '@growthos/firebase-orm-models';
import { BOARD_TILE_TYPES } from '@growthos/firebase-orm-models';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export type ParsedCreateBoardRequest = { name: string; error?: undefined } | { name?: undefined; error: NextResponse };

export async function parseCreateBoardRequestBody(request: NextRequest): Promise<ParsedCreateBoardRequest> {
  const parsed = await parseJsonBody<{ name?: unknown }>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  if (typeof parsed.body.name !== 'string' || parsed.body.name.trim().length === 0) {
    return { error: NextResponse.json({ error: 'name_required' }, { status: 400 }) };
  }
  return { name: parsed.body.name };
}

export interface ParsedBoardSettingsUpdate {
  name?: string;
  dateRange?: { start: string; end: string; grain: TimeGrain };
  compare?: ComparePeriod | null;
  globalFilters?: CompilerFilter[];
}

export type ParsedUpdateBoardSettingsRequest = (ParsedBoardSettingsUpdate & { error?: undefined }) | { error: NextResponse };

function parseDateRange(value: unknown): { start: string; end: string; grain: TimeGrain } | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.start !== 'string' || typeof record.end !== 'string' || typeof record.grain !== 'string') {
    return undefined;
  }
  if (!(TIME_GRAINS as readonly string[]).includes(record.grain)) {
    return undefined;
  }
  return { start: record.start, end: record.end, grain: record.grain as TimeGrain };
}

function parseGlobalFilters(value: unknown): CompilerFilter[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const filters: CompilerFilter[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).field !== 'string' ||
      typeof (entry as Record<string, unknown>).operator !== 'string' ||
      typeof (entry as Record<string, unknown>).value !== 'string' ||
      !(METRIC_FILTER_OPERATORS as readonly string[]).includes((entry as Record<string, unknown>).operator as string)
    ) {
      return undefined;
    }
    const filterRecord = entry as { field: string; operator: string; value: string };
    filters.push({ field: filterRecord.field, operator: filterRecord.operator as CompilerFilter['operator'], value: filterRecord.value });
  }
  return filters;
}

/** Every field is optional — a caller updates only what it sends (`updateBoardSettings`'s own partial-update semantics). `compare: null` clears an existing compare period; an absent `compare` key leaves it untouched. */
export async function parseUpdateBoardSettingsRequestBody(request: NextRequest): Promise<ParsedUpdateBoardSettingsRequest> {
  const parsed = await parseJsonBody<{ name?: unknown; dateRange?: unknown; compare?: unknown; globalFilters?: unknown }>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const { name, dateRange: rawDateRange, compare: rawCompare, globalFilters: rawGlobalFilters } = parsed.body;
  const result: ParsedBoardSettingsUpdate = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { error: NextResponse.json({ error: 'invalid_name' }, { status: 400 }) };
    }
    result.name = name;
  }

  if (rawDateRange !== undefined) {
    const dateRange = parseDateRange(rawDateRange);
    if (!dateRange) {
      return { error: NextResponse.json({ error: 'invalid_date_range' }, { status: 400 }) };
    }
    result.dateRange = dateRange;
  }

  if (rawCompare !== undefined) {
    if (rawCompare !== null && !(COMPARE_PERIODS as readonly string[]).includes(rawCompare as string)) {
      return { error: NextResponse.json({ error: 'invalid_compare' }, { status: 400 }) };
    }
    result.compare = rawCompare as ComparePeriod | null;
  }

  if (rawGlobalFilters !== undefined) {
    const globalFilters = parseGlobalFilters(rawGlobalFilters);
    if (!globalFilters) {
      return { error: NextResponse.json({ error: 'invalid_global_filters' }, { status: 400 }) };
    }
    result.globalFilters = globalFilters;
  }

  return result;
}

export type ParsedSaveBoardTilesRequest = { tiles: BoardTile[]; error?: undefined } | { tiles?: undefined; error: NextResponse };

function parseTile(value: unknown): BoardTile | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.trim().length === 0) {
    return undefined;
  }
  if (typeof record.type !== 'string' || !(BOARD_TILE_TYPES as readonly string[]).includes(record.type)) {
    return undefined;
  }
  if (typeof record.title !== 'string') {
    return undefined;
  }
  const layout = record.layout;
  if (
    typeof layout !== 'object' ||
    layout === null ||
    typeof (layout as Record<string, unknown>).x !== 'number' ||
    typeof (layout as Record<string, unknown>).y !== 'number' ||
    typeof (layout as Record<string, unknown>).w !== 'number' ||
    typeof (layout as Record<string, unknown>).h !== 'number'
  ) {
    return undefined;
  }
  if (!Array.isArray(record.metricNames) || record.metricNames.some((entry) => typeof entry !== 'string')) {
    return undefined;
  }
  if (!Array.isArray(record.dimensions) || record.dimensions.some((entry) => typeof entry !== 'string')) {
    return undefined;
  }
  if (record.cohortConversionEvent !== undefined && typeof record.cohortConversionEvent !== 'string') {
    return undefined;
  }
  const { x, y, w, h } = layout as { x: number; y: number; w: number; h: number };
  return {
    id: record.id,
    type: record.type as BoardTileType,
    title: record.title,
    layout: { x, y, w, h },
    metricNames: record.metricNames as string[],
    dimensions: record.dimensions as string[],
    ...(typeof record.cohortConversionEvent === 'string' ? { cohortConversionEvent: record.cohortConversionEvent } : {}),
  };
}

/** Parses the grid editor's "save layout" payload — the whole `tiles` array, replaced in one write (see `saveBoardTiles`'s own doc comment for why). Field-shape validation only; business rules (metric must be registered+active, funnel needs ≥2 steps, layout fits the grid, ...) are `board.service.ts`'s job. */
export async function parseSaveBoardTilesRequestBody(request: NextRequest): Promise<ParsedSaveBoardTilesRequest> {
  const parsed = await parseJsonBody<{ tiles?: unknown }>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  if (!Array.isArray(parsed.body.tiles)) {
    return { error: NextResponse.json({ error: 'invalid_tiles' }, { status: 400 }) };
  }
  const tiles: BoardTile[] = [];
  for (const entry of parsed.body.tiles) {
    const tile = parseTile(entry);
    if (!tile) {
      return { error: NextResponse.json({ error: 'invalid_tiles' }, { status: 400 }) };
    }
    tiles.push(tile);
  }
  return { tiles };
}
