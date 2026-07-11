import { createHash } from 'node:crypto';
import { evaluateWinRuleFilters, isWinRuleFilterOperator, type WinRuleFilter } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { WinRuleModel } from '../models/win-rule.model';
import { WinEventModel } from '../models/win-event.model';
import type { SchemaDefKind } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveSchemaDefinition } from './schema-registry.service';

export class InvalidWinRuleError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid win rule: ${reasons.join('; ')}`);
    this.name = 'InvalidWinRuleError';
  }
}

export class WinRuleNotFoundError extends Error {
  constructor() {
    super('No win rule with this id exists in this project.');
    this.name = 'WinRuleNotFoundError';
  }
}

/** Bounds the admin list/feed reads the same way every other project rollup in this codebase does. */
export const DEFAULT_WIN_RULE_LIST_LIMIT = 200;
export const DEFAULT_WIN_EVENT_LIST_LIMIT = 100;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function loadWinRule(organizationId: string, projectId: string, winRuleId: string): Promise<WinRuleModel> {
  const rule = await WinRuleModel.init(winRuleId, { organization_id: organizationId, project_id: projectId });
  if (!rule || rule.organization_id !== organizationId || rule.project_id !== projectId) {
    throw new WinRuleNotFoundError();
  }
  return rule;
}

/**
 * Validates every field of a win-rule filter list, collecting every problem
 * before throwing — the same multi-reason-array convention
 * `validateGoalFields`/`validateAggregation`/`validateTiles` already use.
 */
function validateFilters(filters: readonly WinRuleFilter[], reasons: string[]): WinRuleFilter[] {
  const validated: WinRuleFilter[] = [];
  filters.forEach((filter, index) => {
    const field = filter.field?.trim() ?? '';
    if (field.length === 0) {
      reasons.push(`Filter ${index + 1}: field must not be empty.`);
      return;
    }
    if (!isWinRuleFilterOperator(filter.operator)) {
      reasons.push(`Filter ${index + 1}: unknown operator "${filter.operator}".`);
      return;
    }
    if (typeof filter.value !== 'string' || filter.value.trim().length === 0) {
      reasons.push(`Filter ${index + 1}: value must not be empty.`);
      return;
    }
    validated.push({ field, operator: filter.operator, value: filter.value });
  });
  return validated;
}

export interface CreateWinRuleParams {
  organizationId: string;
  projectId: string;
  name: string;
  schemaName: string;
  filters: readonly WinRuleFilter[];
  createdByUserId: string;
}

/** Creates a win rule (KAN-65): validates the name, filter clauses, and that `schemaName` is a currently-active `event` schema in this project. */
export async function createWinRule(params: CreateWinRuleParams): Promise<WinRuleModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];
  const name = params.name.trim();
  if (name.length === 0) {
    reasons.push('A win rule must have a non-empty name.');
  }

  const schemaName = params.schemaName.trim();
  if (schemaName.length === 0) {
    reasons.push('A win rule must reference an event schema.');
  } else {
    const schema = await getActiveSchemaDefinition(params.organizationId, params.projectId, 'event', schemaName);
    if (!schema) {
      reasons.push(`Event schema "${schemaName}" is not registered (or not active) in this project.`);
    }
  }

  const filters = validateFilters(params.filters, reasons);

  if (reasons.length > 0) {
    throw new InvalidWinRuleError(reasons);
  }

  const now = new Date().toISOString();
  const rule = new WinRuleModel();
  rule.organization_id = params.organizationId;
  rule.project_id = params.projectId;
  rule.name = name;
  rule.schema_name = schemaName;
  rule.filters = filters;
  rule.active = true;
  rule.created_by = params.createdByUserId;
  rule.created_at = now;
  rule.updated_by = params.createdByUserId;
  rule.updated_at = now;
  rule.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await rule.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'win_rule.create',
      targetType: 'win_rule',
      targetId: rule.id,
      summary: `Created win rule "${rule.name}" on event "${rule.schema_name}"`,
    });
  } catch {
    // Best-effort — see the comment in `createGoal`.
  }

  return rule;
}

/** Every win rule in a project, newest-first. */
export async function listWinRulesForProject(organizationId: string, projectId: string): Promise<WinRuleModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const rules = await WinRuleModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .limit(DEFAULT_WIN_RULE_LIST_LIMIT)
    .get();
  return rules.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Every currently-`active` win rule watching one event schema in a project — the hot-path lookup `evaluateRecordAgainstWinRules` calls on every landed event. */
async function listActiveWinRulesForSchema(
  organizationId: string,
  projectId: string,
  schemaName: string,
): Promise<WinRuleModel[]> {
  const rules = await WinRuleModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('schema_name', '==', schemaName)
    .where('active', '==', true)
    .get();
  return rules;
}

export interface UpdateWinRuleParams {
  organizationId: string;
  projectId: string;
  winRuleId: string;
  name?: string;
  filters?: readonly WinRuleFilter[];
  active?: boolean;
  updatedByUserId: string;
}

/** Updates a win rule's name/filters/active flag in place — a win rule is mutable config, the same "current = only" posture `updateBoardSettings` uses for boards. */
export async function updateWinRule(params: UpdateWinRuleParams): Promise<WinRuleModel> {
  const rule = await loadWinRule(params.organizationId, params.projectId, params.winRuleId);

  const reasons: string[] = [];
  let name = rule.name;
  if (params.name !== undefined) {
    name = params.name.trim();
    if (name.length === 0) {
      reasons.push('A win rule must have a non-empty name.');
    }
  }

  let filters = rule.filters;
  if (params.filters !== undefined) {
    filters = validateFilters(params.filters, reasons);
  }

  if (reasons.length > 0) {
    throw new InvalidWinRuleError(reasons);
  }

  rule.name = name;
  rule.filters = filters;
  if (params.active !== undefined) {
    rule.active = params.active;
  }
  rule.updated_by = params.updatedByUserId;
  rule.updated_at = new Date().toISOString();
  await rule.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.updatedByUserId,
      action: 'win_rule.update',
      targetType: 'win_rule',
      targetId: rule.id,
      summary: `Updated win rule "${rule.name}"`,
    });
  } catch {
    // Best-effort — see the comment in `createGoal`.
  }

  return rule;
}

/** Deletes a win rule outright — disposable config, the same posture `deleteGoal`/`deleteBoard` document. Past `WinEventModel`s it already fired are left untouched (a win is a historical fact, see that model's own doc comment). */
export async function deleteWinRule(
  organizationId: string,
  projectId: string,
  winRuleId: string,
  deletedByUserId: string,
): Promise<void> {
  const rule = await loadWinRule(organizationId, projectId, winRuleId);
  await rule.delete();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: deletedByUserId,
      action: 'win_rule.delete',
      targetType: 'win_rule',
      targetId: winRuleId,
      summary: `Deleted win rule "${rule.name}"`,
    });
  } catch {
    // Best-effort — see the comment in `createGoal`.
  }
}

/** Deterministic `WinEventModel` id for one (landed record, rule) pair — see that model's own doc comment for why this makes re-evaluation idempotent. */
export function winEventId(rawRecordId: string, winRuleId: string): string {
  return createHash('sha256').update(`${rawRecordId}:${winRuleId}`).digest('hex');
}

export interface EvaluateRecordAgainstWinRulesParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  kind: SchemaDefKind;
  schemaName: string;
  clientId: string;
  payload: Record<string, unknown>;
  rawRecordId: string;
  occurredAt: string;
}

/**
 * The realtime path's "detect a win" hop (KAN-65 AC: "ingest -> Pub/Sub ->
 * WebSocket", `<5s`): called synchronously right after a record lands
 * (`landPipelineMessages`, KAN-33's Pub/Sub stand-in) from `ingest.service.ts`.
 * Win rules only ever watch `event`-kind records (plan `04 §6`: "new
 * paid/upgrade/big-order events") — a non-event kind is a fast no-op, not an
 * error, so callers on the entity/measure ingest path can call this
 * unconditionally without a kind check of their own.
 *
 * Idempotent per (record, rule): `winEventId` makes a re-evaluation of the
 * same landed record against the same rule (a retried ingest, a future
 * replay) overwrite the same document rather than duplicate a feed entry.
 * Not transactional across rules — the same documented, deliberately-deferred
 * tradeoff `checkTrackingAlertsForProject`'s own doc comment describes for
 * its own existence-then-write gap; two concurrent evaluations of the exact
 * same (record, rule) pair both write the same deterministic id, so the
 * result is a redundant overwrite, not a duplicate.
 */
export async function evaluateRecordAgainstWinRules(params: EvaluateRecordAgainstWinRulesParams): Promise<WinEventModel[]> {
  if (params.kind !== 'event') {
    return [];
  }

  const rules = await listActiveWinRulesForSchema(params.organizationId, params.projectId, params.schemaName);
  if (rules.length === 0) {
    return [];
  }

  const matched = rules.filter((rule) => evaluateWinRuleFilters(params.payload, rule.filters));
  if (matched.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  return Promise.all(
    matched.map(async (rule) => {
      const winEvent = new WinEventModel();
      winEvent.organization_id = params.organizationId;
      winEvent.project_id = params.projectId;
      winEvent.environment_id = params.environmentId;
      winEvent.win_rule_id = rule.id;
      winEvent.win_rule_name = rule.name;
      winEvent.schema_name = params.schemaName;
      winEvent.raw_record_id = params.rawRecordId;
      winEvent.client_id = params.clientId;
      winEvent.payload = params.payload;
      winEvent.occurred_at = params.occurredAt;
      winEvent.created_at = now;
      winEvent.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
      await winEvent.save(winEventId(params.rawRecordId, rule.id));
      return winEvent;
    }),
  );
}

/** The most recent wins in a project, newest-first — the admin feed's initial page render. */
export async function listRecentWinEventsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_WIN_EVENT_LIST_LIMIT,
): Promise<WinEventModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return WinEventModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('created_at', 'desc')
    .limit(Math.min(limit, DEFAULT_WIN_EVENT_LIST_LIMIT))
    .get();
}

/**
 * Every win created at-or-after `sinceIso` (inclusive), oldest-first — the
 * live feed's incremental-poll building block (`apps/web`'s win-feed SSE
 * stream stands in for a real WebSocket push subscription; see that route's
 * own doc comment). Oldest-first (unlike {@link listRecentWinEventsForProject})
 * so a poller can advance its own cursor to the last item's `created_at`
 * without skipping anything in between.
 *
 * Deliberately inclusive, not strictly-after: `evaluateRecordAgainstWinRules`
 * stamps every win fired within one call with the same millisecond-resolution
 * `created_at`, and `ingestBatch` fans that call out concurrently across a
 * batch's delivered records — so two win events sharing an identical
 * `created_at` is a real, expected occurrence under load, not an edge case.
 * A strictly-after cursor would let a poller that already advanced past that
 * timestamp permanently miss a same-timestamp sibling written a moment later.
 * Callers that re-poll with a cursor equal to an already-seen win's
 * `created_at` are expected to dedupe by id against what they've already
 * flushed (see `createWinFeedStream`'s own `seenAtCursor` tracking) rather
 * than rely on this query to exclude it.
 */
export async function listWinEventsSince(
  organizationId: string,
  projectId: string,
  sinceIso: string,
  limit: number = DEFAULT_WIN_EVENT_LIST_LIMIT,
): Promise<WinEventModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return WinEventModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('created_at', '>=', sinceIso)
    .orderBy('created_at')
    .limit(Math.min(limit, DEFAULT_WIN_EVENT_LIST_LIMIT))
    .get();
}
