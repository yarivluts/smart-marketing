import { NextResponse, type NextRequest } from 'next/server';
import { isSegmentFilterOperator, isSegmentWorkListStatus, type SegmentWorkListStatus } from '@growthos/shared';
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

export interface ParsedUpdateSegmentWorkListFields {
  /** `undefined` when the request didn't touch the owner at all — distinct from `null`, which explicitly unassigns it. */
  ownerPersonId?: string | null;
  status?: SegmentWorkListStatus;
}

export type ParsedUpdateSegmentWorkListRequest = (ParsedUpdateSegmentWorkListFields & { error?: undefined }) | { error: NextResponse };

interface RawUpdateSegmentWorkListBody {
  ownerPersonId?: unknown;
  status?: unknown;
}

/**
 * Field-*shape* validation for the KAN-81 "assign owner / tick status"
 * PATCH — same "shape here, business rules (owner-exists check) in the
 * service" split `parseCreateSegmentRequestBody` documents for its own
 * sibling. At least one of `ownerPersonId`/`status` must be present so a
 * no-op PATCH is rejected rather than silently doing nothing.
 */
export async function parseUpdateSegmentWorkListRequestBody(request: NextRequest): Promise<ParsedUpdateSegmentWorkListRequest> {
  const parsed = await parseJsonBody<RawUpdateSegmentWorkListBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  const hasOwner = Object.prototype.hasOwnProperty.call(body, 'ownerPersonId');
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  if (!hasOwner && !hasStatus) {
    return invalid('no_fields_to_update');
  }

  const result: ParsedUpdateSegmentWorkListFields = {};

  if (hasOwner) {
    if (body.ownerPersonId !== null && (typeof body.ownerPersonId !== 'string' || body.ownerPersonId.trim().length === 0)) {
      return invalid('invalid_owner_person_id');
    }
    result.ownerPersonId = body.ownerPersonId as string | null;
  }

  if (hasStatus) {
    if (typeof body.status !== 'string' || !isSegmentWorkListStatus(body.status)) {
      return invalid('invalid_status');
    }
    result.status = body.status;
  }

  return result;
}
