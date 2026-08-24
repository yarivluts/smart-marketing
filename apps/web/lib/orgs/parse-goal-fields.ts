import { NextResponse, type NextRequest } from 'next/server';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export interface ParsedCreateGoalFields {
  name: string;
  metricName: string;
  direction: string;
  targetValue?: number;
  rangeMin?: number;
  rangeMax?: number;
  startDate: string;
  deadline: string;
  rhythm: string;
  ownerPersonId: string;
}

export type ParsedCreateGoalRequest = (ParsedCreateGoalFields & { error?: undefined }) | { error: NextResponse };

interface RawCreateGoalBody {
  name?: unknown;
  metricName?: unknown;
  direction?: unknown;
  targetValue?: unknown;
  rangeMin?: unknown;
  rangeMax?: unknown;
  startDate?: unknown;
  deadline?: unknown;
  rhythm?: unknown;
  ownerPersonId?: unknown;
}

function invalid(error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status: 400 }) };
}

/**
 * Field-*shape* validation only (non-empty strings where a string is
 * required, `number` where a number is required if sent at all) — the same
 * "shape here, business rules in the service" split `parseSaveBoardTilesRequestBody`'s
 * own doc comment describes. `createGoal` (`goal.service.ts`) is the one that
 * checks the metric is registered+active, the owner exists, direction-specific
 * fields are present and finite, and the date range is ordered correctly —
 * this only makes sure the request is well-formed enough to hand off to it.
 */
export async function parseCreateGoalRequestBody(request: NextRequest): Promise<ParsedCreateGoalRequest> {
  const parsed = await parseJsonBody<RawCreateGoalBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return invalid('name_required');
  }
  if (typeof body.metricName !== 'string' || body.metricName.trim().length === 0) {
    return invalid('metric_name_required');
  }
  if (typeof body.direction !== 'string' || body.direction.trim().length === 0) {
    return invalid('direction_required');
  }
  if (typeof body.startDate !== 'string' || body.startDate.trim().length === 0) {
    return invalid('start_date_required');
  }
  if (typeof body.deadline !== 'string' || body.deadline.trim().length === 0) {
    return invalid('deadline_required');
  }
  if (typeof body.rhythm !== 'string' || body.rhythm.trim().length === 0) {
    return invalid('rhythm_required');
  }
  if (typeof body.ownerPersonId !== 'string' || body.ownerPersonId.trim().length === 0) {
    return invalid('owner_person_id_required');
  }
  if (body.targetValue !== undefined && typeof body.targetValue !== 'number') {
    return invalid('invalid_target_value');
  }
  if (body.rangeMin !== undefined && typeof body.rangeMin !== 'number') {
    return invalid('invalid_range_min');
  }
  if (body.rangeMax !== undefined && typeof body.rangeMax !== 'number') {
    return invalid('invalid_range_max');
  }

  return {
    name: body.name,
    metricName: body.metricName,
    direction: body.direction,
    ...(body.targetValue !== undefined ? { targetValue: body.targetValue } : {}),
    ...(body.rangeMin !== undefined ? { rangeMin: body.rangeMin } : {}),
    ...(body.rangeMax !== undefined ? { rangeMax: body.rangeMax } : {}),
    startDate: body.startDate,
    deadline: body.deadline,
    rhythm: body.rhythm,
    ownerPersonId: body.ownerPersonId,
  };
}

export interface ParsedUpdateGoalFields {
  targetValue?: number;
  rangeMin?: number;
  rangeMax?: number;
}

export type ParsedUpdateGoalRequest = (ParsedUpdateGoalFields & { error?: undefined }) | { error: NextResponse };

interface RawUpdateGoalBody {
  targetValue?: unknown;
  rangeMin?: unknown;
  rangeMax?: unknown;
}

/**
 * Field-*shape* validation only (`no_fields_to_update` if the request
 * touches none of the three, `number` where a number was sent at all) —
 * direction-specific business rules (a "range" goal has no single target
 * value, `rangeMin < rangeMax`, etc.) live in `updateGoal`
 * (`goal.service.ts`), the same split `parseUpdateRepCollectionEntryRequestBody`
 * documents for its own sibling.
 */
export async function parseUpdateGoalRequestBody(request: NextRequest): Promise<ParsedUpdateGoalRequest> {
  const parsed = await parseJsonBody<RawUpdateGoalBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  const hasTargetValue = Object.prototype.hasOwnProperty.call(body, 'targetValue');
  const hasRangeMin = Object.prototype.hasOwnProperty.call(body, 'rangeMin');
  const hasRangeMax = Object.prototype.hasOwnProperty.call(body, 'rangeMax');
  if (!hasTargetValue && !hasRangeMin && !hasRangeMax) {
    return invalid('no_fields_to_update');
  }

  const result: ParsedUpdateGoalFields = {};

  if (hasTargetValue) {
    if (typeof body.targetValue !== 'number' || !Number.isFinite(body.targetValue)) {
      return invalid('invalid_target_value');
    }
    result.targetValue = body.targetValue;
  }
  if (hasRangeMin) {
    if (typeof body.rangeMin !== 'number' || !Number.isFinite(body.rangeMin)) {
      return invalid('invalid_range_min');
    }
    result.rangeMin = body.rangeMin;
  }
  if (hasRangeMax) {
    if (typeof body.rangeMax !== 'number' || !Number.isFinite(body.rangeMax)) {
      return invalid('invalid_range_max');
    }
    result.rangeMax = body.rangeMax;
  }

  return result;
}
