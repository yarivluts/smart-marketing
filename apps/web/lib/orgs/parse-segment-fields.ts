import { NextResponse, type NextRequest } from 'next/server';
import { isSegmentEventConditionKind, isSegmentFilterOperator, isSegmentWorkListStatus, type SegmentWorkListStatus } from '@growthos/shared';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export interface ParsedSegmentFilterCondition {
  field: string;
  op: string;
  value: string | number | boolean;
}

export interface ParsedSegmentEventCondition {
  kind: string;
  schemaName: string;
  filters?: ParsedSegmentFilterCondition[];
  withinDays?: number;
}

export interface ParsedCreateSegmentFields {
  name: string;
  schemaName: string;
  filters: ParsedSegmentFilterCondition[];
  eventConditions: ParsedSegmentEventCondition[];
}

export type ParsedCreateSegmentRequest = (ParsedCreateSegmentFields & { error?: undefined }) | { error: NextResponse };

interface RawSegmentFilterCondition {
  field?: unknown;
  op?: unknown;
  value?: unknown;
}

interface RawSegmentEventCondition {
  kind?: unknown;
  schemaName?: unknown;
  filters?: unknown;
  withinDays?: unknown;
}

interface RawCreateSegmentBody {
  name?: unknown;
  schemaName?: unknown;
  filters?: unknown;
  eventConditions?: unknown;
}

function invalid(error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status: 400 }) };
}

/** Shape-validates one `{ field, op, value }` filter condition (used both for a segment's own entity filters and for a nested event-condition filter, KAN-93). Returns `null` on a malformed entry. */
function parseFilterCondition(rawFilter: RawSegmentFilterCondition): ParsedSegmentFilterCondition | null {
  if (typeof rawFilter !== 'object' || rawFilter === null) {
    return null;
  }
  const { field, op, value } = rawFilter;
  if (typeof field !== 'string' || field.trim().length === 0) {
    return null;
  }
  if (typeof op !== 'string' || !isSegmentFilterOperator(op)) {
    return null;
  }
  const valueType = typeof value;
  if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') {
    return null;
  }
  return { field, op, value: value as string | number | boolean };
}

/**
 * Field-*shape* validation only — the same "shape here, business rules in
 * the service" split `parseCreateGoalRequestBody`'s own doc comment
 * describes. `createSegment` (`segment.service.ts`) is the one that checks
 * `schemaName` (and each event condition's own `schemaName`) is
 * registered+active and re-validates every filter/event condition against
 * `isValidSegmentFilterCondition`/`isValidSegmentEventCondition`; this only
 * makes sure the request is well-formed enough to hand off to it (an array
 * of plain objects with the right field names/types). `eventConditions`
 * (KAN-93) is optional — omitted or `[]` when a segment only ever needs
 * entity filters, same as before this field existed.
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
  if (body.filters !== undefined && !Array.isArray(body.filters)) {
    return invalid('invalid_filter');
  }
  const rawFilters = (body.filters as RawSegmentFilterCondition[] | undefined) ?? [];

  const rawEventConditions = body.eventConditions;
  if (rawEventConditions !== undefined && !Array.isArray(rawEventConditions)) {
    return invalid('invalid_event_condition');
  }
  const eventConditionEntries = (rawEventConditions as RawSegmentEventCondition[] | undefined) ?? [];

  if (rawFilters.length === 0 && eventConditionEntries.length === 0) {
    return invalid('filters_required');
  }

  const filters: ParsedSegmentFilterCondition[] = [];
  for (const rawFilter of rawFilters) {
    const filter = parseFilterCondition(rawFilter);
    if (!filter) {
      return invalid('invalid_filter');
    }
    filters.push(filter);
  }

  const eventConditions: ParsedSegmentEventCondition[] = [];
  for (const rawCondition of eventConditionEntries) {
    if (typeof rawCondition !== 'object' || rawCondition === null) {
      return invalid('invalid_event_condition');
    }
    const { kind, schemaName, filters: rawConditionFilters, withinDays } = rawCondition;
    if (typeof kind !== 'string' || !isSegmentEventConditionKind(kind)) {
      return invalid('invalid_event_condition');
    }
    if (typeof schemaName !== 'string' || schemaName.trim().length === 0) {
      return invalid('invalid_event_condition');
    }
    const condition: ParsedSegmentEventCondition = { kind, schemaName };
    if (rawConditionFilters !== undefined) {
      if (!Array.isArray(rawConditionFilters)) {
        return invalid('invalid_event_condition');
      }
      const conditionFilters: ParsedSegmentFilterCondition[] = [];
      for (const rawFilter of rawConditionFilters as RawSegmentFilterCondition[]) {
        const filter = parseFilterCondition(rawFilter);
        if (!filter) {
          return invalid('invalid_event_condition');
        }
        conditionFilters.push(filter);
      }
      condition.filters = conditionFilters;
    }
    if (withinDays !== undefined) {
      if (typeof withinDays !== 'number' || !Number.isInteger(withinDays) || withinDays <= 0) {
        return invalid('invalid_event_condition');
      }
      condition.withinDays = withinDays;
    }
    eventConditions.push(condition);
  }

  return { name: body.name, schemaName: body.schemaName, filters, eventConditions };
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
