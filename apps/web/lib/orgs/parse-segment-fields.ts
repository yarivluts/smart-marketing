import { NextResponse, type NextRequest } from 'next/server';
import { isSegmentFilterOperator } from '@growthos/shared';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export interface ParsedCreateSegmentFields {
  name: string;
  schemaName: string;
  filters: Array<{ field: string; op: string; value: string | number | boolean }>;
}

export type ParsedCreateSegmentRequest = (ParsedCreateSegmentFields & { error?: undefined }) | { error: NextResponse };

interface RawSegmentFilterCondition {
  field?: unknown;
  op?: unknown;
  value?: unknown;
}

interface RawCreateSegmentBody {
  name?: unknown;
  schemaName?: unknown;
  filters?: unknown;
}

function invalid(error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status: 400 }) };
}

/**
 * Field-*shape* validation only — the same "shape here, business rules in
 * the service" split `parseCreateGoalRequestBody`'s own doc comment
 * describes. `createSegment` (`segment.service.ts`) is the one that checks
 * `schemaName` is registered+active and re-validates each filter condition
 * against `isValidSegmentFilterCondition`; this only makes sure the request
 * is well-formed enough to hand off to it (an array of plain objects with
 * the right field names/types).
 */
export async function parseCreateSegmentRequestBody(request: NextRequest): Promise<ParsedCreateSegmentRequest> {
  const parsed = await parseJsonBody<RawCreateSegmentBody>(request);
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
  if (!Array.isArray(body.filters) || body.filters.length === 0) {
    return invalid('filters_required');
  }

  const filters: Array<{ field: string; op: string; value: string | number | boolean }> = [];
  for (const rawFilter of body.filters as RawSegmentFilterCondition[]) {
    if (typeof rawFilter !== 'object' || rawFilter === null) {
      return invalid('invalid_filter');
    }
    const { field, op, value } = rawFilter;
    if (typeof field !== 'string' || field.trim().length === 0) {
      return invalid('invalid_filter');
    }
    if (typeof op !== 'string' || !isSegmentFilterOperator(op)) {
      return invalid('invalid_filter');
    }
    const valueType = typeof value;
    if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') {
      return invalid('invalid_filter');
    }
    filters.push({ field, op, value: value as string | number | boolean });
  }

  return { name: body.name, schemaName: body.schemaName, filters };
}
