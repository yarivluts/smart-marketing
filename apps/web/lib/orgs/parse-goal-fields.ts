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
 * own doc comment describes. `createGoal`/`updateGoalDefinition`
 * (`goal.service.ts`) are the ones that check the metric is
 * registered+active, the owner exists, direction-specific fields are
 * present and finite, and the date range is ordered correctly — this only
 * makes sure the request is well-formed enough to hand off to them. Shared
 * by `parseCreateGoalRequestBody` (POST, new goal) and
 * `parseUpdateGoalRequestBody`'s definition branch (PATCH, KAN-128's
 * full-replace edit), since the two accept an identical body shape — the
 * same "one shape-validator, both create and full-replace-update reuse it"
 * posture `parseSegmentDefinitionFields` (KAN-120) establishes for its own
 * sibling.
 */
function parseGoalDefinitionFields(body: RawCreateGoalBody): ParsedCreateGoalRequest {
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

export async function parseCreateGoalRequestBody(request: NextRequest): Promise<ParsedCreateGoalRequest> {
  const parsed = await parseJsonBody<RawCreateGoalBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  return parseGoalDefinitionFields(parsed.body);
}

export interface ParsedUpdateGoalFields {
  targetValue?: number;
  rangeMin?: number;
  rangeMax?: number;
}

export type ParsedUpdateGoalTargetRequest = (ParsedUpdateGoalFields & { error?: undefined }) | { error: NextResponse };

type RawUpdateGoalBody = RawCreateGoalBody;

/**
 * Field-*shape* validation only (`no_fields_to_update` if the request
 * touches none of the three, `number` where a number was sent at all) —
 * direction-specific business rules (a "range" goal has no single target
 * value, `rangeMin < rangeMax`, etc.) live in `updateGoal`
 * (`goal.service.ts`), the same split `parseUpdateRepCollectionEntryRequestBody`
 * documents for its own sibling.
 */
function parseGoalTargetFields(body: RawUpdateGoalBody): ParsedUpdateGoalTargetRequest {
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

const GOAL_DEFINITION_ONLY_FIELD_KEYS = ['name', 'metricName', 'direction', 'startDate', 'deadline', 'rhythm', 'ownerPersonId'] as const;

function hasAnyOwnProperty(body: object, keys: readonly string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

export type ParsedUpdateGoalRequest =
  | ({ kind: 'definition' } & ParsedCreateGoalFields & { error?: undefined })
  | ({ kind: 'target' } & ParsedUpdateGoalFields & { error?: undefined })
  | { kind?: undefined; error: NextResponse };

/**
 * One PATCH body dispatches to exactly one of two independent goal update
 * surfaces on the same route: KAN-85's inline target/range cell (`kind:
 * 'target'`), or KAN-128's full-definition edit (`kind: 'definition'`) —
 * name/metric/direction/dates/rhythm/owner. The two never overlap on which
 * *non-target* keys they touch, but both can carry `targetValue`/`rangeMin`/
 * `rangeMax` (a definition edit also lets an admin correct the target in
 * the same round trip) — so the dispatch key is presence of any
 * definition-only field ({@link GOAL_DEFINITION_ONLY_FIELD_KEYS}), not the
 * target/range keys themselves. The two admin-page controls that drive them
 * (`GoalTargetInput`, `EditGoalForm`) never submit a body that's ambiguous
 * under this rule: `GoalTargetInput` only ever sends target/range keys.
 * Reads the request body exactly once (a `NextRequest` body can only be
 * consumed once) and inspects which keys are present before delegating to
 * the matching shape-validator, the same structure
 * `parseUpdateSegmentRequestBody` (KAN-120) uses for its own two-kind PATCH.
 */
export async function parseUpdateGoalRequestBody(request: NextRequest): Promise<ParsedUpdateGoalRequest> {
  const parsed = await parseJsonBody<RawUpdateGoalBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  if (hasAnyOwnProperty(body, GOAL_DEFINITION_ONLY_FIELD_KEYS)) {
    const result = parseGoalDefinitionFields(body);
    if (result.error) {
      return { error: result.error };
    }
    return { kind: 'definition', ...result };
  }

  const result = parseGoalTargetFields(body);
  if (result.error) {
    return { error: result.error };
  }
  return { kind: 'target', ...result };
}
