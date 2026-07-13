import {
  calculateGoalProgress,
  computeElapsedFraction,
  isGoalDirection,
  isGoalRhythm,
  MetricCompilerError,
  type GoalDirection,
  type GoalProgressResult,
  type GoalRhythm,
  type MetricQueryRequest,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { GoalModel } from '../models/goal.model';
import { OrgPersonModel } from '../models/org-person.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveMetricDefinition } from './metric-registry.service';
import { queryMetrics } from './metrics-query.service';
import { MetricNotRegisteredError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { WarehouseNotConfiguredError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import type { MetricQueryResultCache } from '../warehouse/result-cache';

export class InvalidGoalError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid goal: ${reasons.join('; ')}`);
    this.name = 'InvalidGoalError';
  }
}

export class GoalNotFoundError extends Error {
  constructor() {
    super('No goal with this id exists in this project.');
    this.name = 'GoalNotFoundError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** The goal's own doc, scoped and existence-checked — the same `.init` + field-match pattern `loadBoard` (`board.service.ts`) uses for its own project-child lookup. */
async function loadGoal(organizationId: string, projectId: string, goalId: string): Promise<GoalModel> {
  const goal = await GoalModel.init(goalId, { organization_id: organizationId, project_id: projectId });
  if (!goal || goal.organization_id !== organizationId || goal.project_id !== projectId) {
    throw new GoalNotFoundError();
  }
  return goal;
}

export interface CreateGoalParams {
  organizationId: string;
  projectId: string;
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
  createdByUserId: string;
  /** Defaults to `'user'` — every pre-KAN-76 caller is a real Firebase-session user (`apps/web`'s own route). KAN-76's `create_goal` MCP tool passes `'api_key'` when the caller authenticated with a machine key rather than a human OAuth grant, so the audit trail doesn't mislabel a key as a user. */
  createdByActorType?: 'user' | 'api_key';
}

interface ValidatedGoalFields {
  name: string;
  direction: GoalDirection;
  targetValue: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  rhythm: GoalRhythm;
}

/**
 * Validates every field of a create request, pushing **all** failures onto
 * the caller's shared `reasons` array rather than failing fast on the first
 * one — the same multi-reason-array convention `validateAggregation`/
 * `validateDefinitionBody` (`metric-registry.service.ts`) and `validateTiles`
 * (`board.service.ts`) already use, so a caller's form can surface every
 * problem in one round trip instead of one-at-a-time. Returns `undefined` if
 * any reason was pushed — callers must not use the return value without also
 * checking `reasons`, mirroring `validateAggregation`'s own contract.
 */
function validateGoalFields(params: CreateGoalParams, reasons: string[]): ValidatedGoalFields | undefined {
  const reasonsBefore = reasons.length;

  const name = params.name.trim();
  if (name.length === 0) {
    reasons.push('A goal must have a non-empty name.');
  }

  if (!isGoalDirection(params.direction)) {
    reasons.push(`Unknown goal direction "${params.direction}".`);
  }
  if (!isGoalRhythm(params.rhythm)) {
    reasons.push(`Unknown goal rhythm "${params.rhythm}".`);
  }

  if (params.startDate >= params.deadline) {
    reasons.push('The goal start date must be before its deadline.');
  }

  let targetValue: number | null = null;
  let rangeMin: number | null = null;
  let rangeMax: number | null = null;

  if (isGoalDirection(params.direction)) {
    if (params.direction === 'maximize' || params.direction === 'minimize') {
      if (params.targetValue === undefined || !Number.isFinite(params.targetValue)) {
        reasons.push(`A "${params.direction}" goal requires a finite target value.`);
      } else {
        targetValue = params.targetValue;
      }
    } else {
      const min = params.rangeMin;
      const max = params.rangeMax;
      if (min === undefined || !Number.isFinite(min) || max === undefined || !Number.isFinite(max)) {
        reasons.push('A "range" goal requires finite rangeMin and rangeMax values.');
      } else if (min >= max) {
        reasons.push('A "range" goal requires rangeMin to be less than rangeMax.');
      } else {
        rangeMin = min;
        rangeMax = max;
      }
    }
  }

  if (reasons.length > reasonsBefore) {
    return undefined;
  }

  return {
    name,
    direction: params.direction as GoalDirection,
    targetValue,
    rangeMin,
    rangeMax,
    rhythm: params.rhythm as GoalRhythm,
  };
}

/** Confirms `ownerPersonId` resolves to an `OrgPersonModel` belonging to `organizationId` — the same `.init` + org-match pattern `requireResourceInOrg` (`resource-library.service.ts`) uses for its own cross-tenant-safe lookup. Pushes onto `reasons` on failure rather than throwing, for the same collect-everything reason as `validateGoalFields`. */
async function validateOrgPersonInOrg(organizationId: string, ownerPersonId: string, reasons: string[]): Promise<void> {
  const person = await OrgPersonModel.init(ownerPersonId, { organization_id: organizationId });
  if (!person || person.organization_id !== organizationId) {
    reasons.push(`Owner "${ownerPersonId}" does not exist in this organization.`);
  }
}

/** Creates a goal (KAN-64, E12.1): validates the metric reference, owner, direction-specific fields, and date range, collecting every problem before throwing. */
export async function createGoal(params: CreateGoalParams): Promise<GoalModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];
  const fields = validateGoalFields(params, reasons);

  const metricDef = await getActiveMetricDefinition(params.organizationId, params.projectId, params.metricName);
  if (!metricDef) {
    reasons.push(`Metric "${params.metricName}" is not registered (or not active) in this project.`);
  }

  await validateOrgPersonInOrg(params.organizationId, params.ownerPersonId, reasons);

  if (reasons.length > 0 || !fields) {
    throw new InvalidGoalError(reasons);
  }

  const now = new Date().toISOString();
  const goal = new GoalModel();
  goal.organization_id = params.organizationId;
  goal.project_id = params.projectId;
  goal.name = fields.name;
  goal.metric_name = params.metricName;
  goal.direction = fields.direction;
  goal.target_value = fields.targetValue;
  goal.range_min = fields.rangeMin;
  goal.range_max = fields.rangeMax;
  goal.start_date = params.startDate;
  goal.deadline = params.deadline;
  goal.rhythm = fields.rhythm;
  goal.owner_person_id = params.ownerPersonId;
  goal.created_by = params.createdByUserId;
  goal.created_at = now;
  goal.updated_by = params.createdByUserId;
  goal.updated_at = now;
  goal.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await goal.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.createdByActorType ?? 'user',
      actorId: params.createdByUserId,
      action: 'goal.create',
      targetType: 'goal',
      targetId: goal.id,
      summary: `Created goal "${goal.name}"`,
    });
  } catch {
    // Best-effort — audit logging must never turn a successful create into a failure for the caller.
  }

  return goal;
}

/** Every goal in a project, deadline-sorted (soonest-first) — unlike `listBoardsForProject`'s alphabetical sort, a goal's most useful default ordering is "what's due soonest", since that's what a human checking in on goals cares about first. */
export async function listGoalsForProject(organizationId: string, projectId: string): Promise<GoalModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const goals = await GoalModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return goals.sort((a, b) => a.deadline.localeCompare(b.deadline));
}

/** One goal, or `null` if it doesn't exist / doesn't belong to this org+project — mirrors `getBoard`'s 404-not-403 shape. */
export async function getGoal(organizationId: string, projectId: string, goalId: string): Promise<GoalModel | null> {
  try {
    return await loadGoal(organizationId, projectId, goalId);
  } catch (error) {
    if (error instanceof GoalNotFoundError) {
      return null;
    }
    throw error;
  }
}

/** Deletes a goal outright — a goal is disposable config, the same "no audit-trail-of-its-own-survival requirement" posture `deleteBoard` documents for boards. */
export async function deleteGoal(organizationId: string, projectId: string, goalId: string, deletedByUserId: string): Promise<void> {
  const goal = await loadGoal(organizationId, projectId, goalId);
  await goal.delete();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: deletedByUserId,
      action: 'goal.delete',
      targetType: 'goal',
      targetId: goalId,
      summary: `Deleted goal "${goal.name}"`,
    });
  } catch {
    // Best-effort — see the comment in createGoal above.
  }
}

export type GoalProgressOutcome =
  | { ok: true; actualValue: number; progress: GoalProgressResult }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

export interface QueryGoalProgressParams {
  organizationId: string;
  projectId: string;
  goal: GoalModel;
  executor?: WarehouseQueryExecutor;
  cache?: MetricQueryResultCache;
  /** `YYYY-MM-DD`. Defaults to today (UTC) — overridable so callers/tests can pin "now". */
  asOfDate?: string;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sums one metric's own column across every returned row — a local mirror of `sumMetric` in `apps/web/lib/orgs/board-view.ts` rather than an import across the app/package boundary (this package must not depend on `apps/web`). */
function sumMetricRows(rows: readonly WarehouseRow[], metricName: string): number {
  return rows.reduce((total, row) => {
    const raw = row[metricName] ?? null;
    if (raw === null) {
      return total;
    }
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? total + num : total;
  }, 0);
}

/**
 * Computes a goal's current progress (KAN-64, E12.1): queries the goal's own
 * metric over `[start_date, min(asOfDate, deadline)]`, sums it into a single
 * `actualValue`, and runs it through `calculateGoalProgress`. Mirrors
 * `queryBoardTile`'s exact error-handling shape (`board.service.ts`) — a
 * goal's own progress thermometer degrades gracefully the same way a board
 * tile does, rather than failing the whole goal detail page.
 */
export async function queryGoalProgress(params: QueryGoalProgressParams): Promise<GoalProgressOutcome> {
  const { goal } = params;
  const asOfDate = params.asOfDate ?? todayDateOnly();

  // A goal whose `start_date` is still in the future has no elapsed window to
  // query yet — `[start_date, asOfDate]` would be an inverted (end < start)
  // range, which `deriveTimeWindows` (packages/shared/src/metrics-compiler/
  // time.ts) rejects as a `MetricCompilerError`. Short-circuiting here avoids
  // that reaching the caller as a raw, internal-looking compiler message in
  // the `query_error` degraded state; a not-yet-started goal is naturally
  // "0 progress, 0% elapsed" without needing a real query or a distinct
  // outcome kind of its own.
  if (asOfDate < goal.start_date) {
    const progress = calculateGoalProgress({
      direction: goal.direction,
      targetValue: goal.target_value ?? undefined,
      rangeMin: goal.range_min ?? undefined,
      rangeMax: goal.range_max ?? undefined,
      actualValue: 0,
      elapsedFraction: 0,
    });
    return { ok: true, actualValue: 0, progress };
  }

  const queryEnd = asOfDate < goal.deadline ? asOfDate : goal.deadline;

  const request: MetricQueryRequest = {
    metrics: [goal.metric_name],
    time: { start: goal.start_date, end: queryEnd, grain: 'day' },
  };

  try {
    const result = await queryMetrics({
      organizationId: params.organizationId,
      projectId: params.projectId,
      request,
      ...(params.executor ? { executor: params.executor } : {}),
      ...(params.cache ? { cache: params.cache } : {}),
    });
    const actualValue = sumMetricRows(result.series, goal.metric_name);
    const elapsedFraction = computeElapsedFraction(goal.start_date, goal.deadline, asOfDate, goal.rhythm);
    const progress = calculateGoalProgress({
      direction: goal.direction,
      targetValue: goal.target_value ?? undefined,
      rangeMin: goal.range_min ?? undefined,
      rangeMax: goal.range_max ?? undefined,
      actualValue,
      elapsedFraction,
    });
    return { ok: true, actualValue, progress };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    // Same deliberate non-blanket-catch posture as `queryBoardTile` — an
    // unrecognized error rethrows instead of degrading into a
    // convincingly-normal-looking "couldn't load" state, see that
    // function's own doc comment for the full rationale.
    if (error instanceof MetricCompilerError || error instanceof ProjectNotFoundError || error instanceof MetricNotRegisteredError) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}
