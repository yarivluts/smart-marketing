import { NextResponse, type NextRequest } from 'next/server';
import { isWinRuleFilterOperator, isWinType, type WinRuleFilter } from '@growthos/shared';
import { parseJsonBody } from '@/lib/http/parse-json-body';

function invalid(error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status: 400 }) };
}

/**
 * Shape-only validation of a raw filter array (a well-formed array of
 * `{field, operator, value}` string triples) — the same "shape here,
 * business rules in the service" split `parseCreateGoalRequestBody`'s own
 * doc comment describes. `createWinRule`/`updateWinRule` (`win-rule.service.ts`)
 * are the ones that reject an unknown operator or an empty field.
 */
function parseFilters(value: unknown): WinRuleFilter[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const filters: WinRuleFilter[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { field?: unknown }).field !== 'string' ||
      typeof (entry as { operator?: unknown }).operator !== 'string' ||
      typeof (entry as { value?: unknown }).value !== 'string'
    ) {
      return undefined;
    }
    const { field, operator, value: filterValue } = entry as { field: string; operator: string; value: string };
    if (!isWinRuleFilterOperator(operator)) {
      return undefined;
    }
    filters.push({ field, operator, value: filterValue });
  }
  return filters;
}

export interface ParsedCreateWinRuleFields {
  name: string;
  schemaName: string;
  filters: WinRuleFilter[];
  winType?: string;
}

export type ParsedCreateWinRuleRequest = (ParsedCreateWinRuleFields & { error?: undefined }) | { error: NextResponse };

interface RawCreateWinRuleBody {
  name?: unknown;
  schemaName?: unknown;
  filters?: unknown;
  winType?: unknown;
}

export async function parseCreateWinRuleRequestBody(request: NextRequest): Promise<ParsedCreateWinRuleRequest> {
  const parsed = await parseJsonBody<RawCreateWinRuleBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return invalid('name_required');
  }
  if (typeof body.schemaName !== 'string' || body.schemaName.trim().length === 0) {
    return invalid('schema_name_required');
  }
  const filters = parseFilters(body.filters ?? []);
  if (filters === undefined) {
    return invalid('invalid_filters');
  }
  if (body.winType !== undefined && (typeof body.winType !== 'string' || !isWinType(body.winType))) {
    return invalid('invalid_win_type');
  }

  return { name: body.name, schemaName: body.schemaName, filters, ...(body.winType !== undefined ? { winType: body.winType as string } : {}) };
}

export interface ParsedUpdateWinRuleFields {
  name?: string;
  filters?: WinRuleFilter[];
  winType?: string;
  active?: boolean;
}

export type ParsedUpdateWinRuleRequest = (ParsedUpdateWinRuleFields & { error?: undefined }) | { error: NextResponse };

interface RawUpdateWinRuleBody {
  name?: unknown;
  filters?: unknown;
  winType?: unknown;
  active?: unknown;
}

export async function parseUpdateWinRuleRequestBody(request: NextRequest): Promise<ParsedUpdateWinRuleRequest> {
  const parsed = await parseJsonBody<RawUpdateWinRuleBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    return invalid('name_required');
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return invalid('invalid_active');
  }
  if (body.winType !== undefined && (typeof body.winType !== 'string' || !isWinType(body.winType))) {
    return invalid('invalid_win_type');
  }
  let filters: WinRuleFilter[] | undefined;
  if (body.filters !== undefined) {
    filters = parseFilters(body.filters);
    if (filters === undefined) {
      return invalid('invalid_filters');
    }
  }

  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(filters !== undefined ? { filters } : {}),
    ...(body.winType !== undefined ? { winType: body.winType as string } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
  };
}
