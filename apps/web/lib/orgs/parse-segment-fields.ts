import { NextResponse, type NextRequest } from 'next/server';
import { isSegmentFilterOperator, SEGMENT_STATUSES, type SegmentStatus } from '@growthos/shared';
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

export interface ParsedUpdateSegmentWorklistFields {
  ownerPersonId?: string | null;
  status?: SegmentStatus;
}

export type ParsedUpdateSegmentWorklistRequest = (ParsedUpdateSegmentWorklistFields & { error?: undefined }) | { error: NextResponse };

interface RawUpdateSegmentWorklistBody {
  ownerPersonId?: unknown;
  status?: unknown;
}

/**
 * Field-shape validation only for a worklist PATCH (KAN-81) — the same
 * "shape here, business rules in the service" split
 * `parseCreateSegmentRequestBody`'s own doc comment describes.
 * `updateSegmentWorklist` (`segment.service.ts`) is the one that checks
 * `ownerPersonId` resolves to a real `OrgPersonModel` in this org. Every
 * field is optional — a caller updates only what it sends, mirroring
 * `parseUpdateBoardSettingsRequestBody`'s own partial-update convention;
 * `ownerPersonId: null` clears an assigned owner, an absent key leaves it
 * untouched.
 */
export async function parseUpdateSegmentWorklistRequestBody(request: NextRequest): Promise<ParsedUpdateSegmentWorklistRequest> {
  const parsed = await parseJsonBody<RawUpdateSegmentWorklistBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const { ownerPersonId, status } = parsed.body;
  const result: ParsedUpdateSegmentWorklistFields = {};

  if (ownerPersonId !== undefined) {
    if (ownerPersonId !== null && (typeof ownerPersonId !== 'string' || ownerPersonId.trim().length === 0)) {
      return invalid('invalid_owner_person_id');
    }
    result.ownerPersonId = ownerPersonId;
  }

  if (status !== undefined) {
    if (typeof status !== 'string' || !(SEGMENT_STATUSES as readonly string[]).includes(status)) {
      return invalid('invalid_status');
    }
    result.status = status as SegmentStatus;
  }

  return result;
}
