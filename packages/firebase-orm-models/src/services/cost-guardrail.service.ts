import { ProjectModel } from '../models/project.model';
import { ProjectCostQuotaModel } from '../models/project-cost-quota.model';
import { QueryCostLogEntryModel, type QueryCostLogOutcome } from '../models/query-cost-log-entry.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * A placeholder default pending real per-project traffic data (tunable per
 * project via {@link setProjectCostQuota} once one exists): generous enough
 * that no story's own test/demo traffic trips it by accident, small enough
 * to be a real guardrail rather than a number nobody could ever reach.
 */
export const DEFAULT_DAILY_QUERY_LIMIT = 500;

/** Same load-bounding reasoning as `listOrchestrationRunsForProject` (KAN-38) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_QUERY_COST_LOG_LIST_LIMIT = 50;

export class InvalidCostQuotaError extends Error {
  constructor(reason: string) {
    super(`Invalid cost quota: ${reason}`);
    this.name = 'InvalidCostQuotaError';
  }
}

export class ProjectQueryQuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Project has reached its daily metric-query quota of ${limit} attempt(s). Try again after 00:00 UTC, or raise the project's quota.`);
    this.name = 'ProjectQueryQuotaExceededError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface ProjectCostQuota {
  dailyQueryLimit: number;
  labels: Record<string, string>;
  /** `null` when the project has never had an explicit quota set — {@link DEFAULT_DAILY_QUERY_LIMIT} applies. */
  setAt: string | null;
  setByUserId?: string;
}

/** The effective quota config for a project: its newest explicit config, or the documented default when none has ever been set. */
export async function getProjectCostQuota(organizationId: string, projectId: string): Promise<ProjectCostQuota> {
  await requireProjectInOrg(organizationId, projectId);
  const [latest] = await ProjectCostQuotaModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('set_at', 'desc')
    .limit(1)
    .get();

  if (!latest) {
    return { dailyQueryLimit: DEFAULT_DAILY_QUERY_LIMIT, labels: {}, setAt: null };
  }
  return {
    dailyQueryLimit: latest.daily_query_limit,
    labels: latest.labels,
    setAt: latest.set_at,
    ...(latest.set_by_user_id !== undefined ? { setByUserId: latest.set_by_user_id } : {}),
  };
}

export interface SetProjectCostQuotaParams {
  organizationId: string;
  projectId: string;
  dailyQueryLimit: number;
  labels: Record<string, string>;
  setByUserId: string;
}

/**
 * Records a new quota config for a project (KAN-39's "per-project BQ
 * quotas/labels" half of the AC). Best-effort audit logging, same swallowed-
 * failure posture `recordOrchestrationRunAudit` already uses.
 */
export async function setProjectCostQuota(params: SetProjectCostQuotaParams): Promise<ProjectCostQuotaModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  if (!Number.isInteger(params.dailyQueryLimit) || params.dailyQueryLimit < 1) {
    throw new InvalidCostQuotaError('dailyQueryLimit must be a positive integer');
  }

  const quota = new ProjectCostQuotaModel();
  quota.organization_id = params.organizationId;
  quota.project_id = params.projectId;
  quota.daily_query_limit = params.dailyQueryLimit;
  quota.labels = params.labels;
  quota.set_at = new Date().toISOString();
  quota.set_by_user_id = params.setByUserId;
  quota.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await quota.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.setByUserId,
      action: 'cost_quota.set',
      targetType: 'project',
      targetId: params.projectId,
      summary: `Set the project's daily metric-query quota to ${params.dailyQueryLimit}`,
      after: { dailyQueryLimit: params.dailyQueryLimit, labels: params.labels },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return quota;
}

export interface RecordQueryCostLogEntryParams {
  organizationId: string;
  projectId: string;
  outcome: QueryCostLogOutcome;
  definitionRefs: Record<string, string>;
}

/** Appends one cost-log entry (KAN-39's "query cost logging" half of the AC) — see `QueryCostLogEntryModel`'s own doc comment for why `estimated_cost_usd` stays `null` today. */
export async function recordQueryCostLogEntry(params: RecordQueryCostLogEntryParams): Promise<QueryCostLogEntryModel> {
  const entry = new QueryCostLogEntryModel();
  entry.organization_id = params.organizationId;
  entry.project_id = params.projectId;
  entry.outcome = params.outcome;
  entry.definition_refs = params.definitionRefs;
  entry.executed_at = new Date().toISOString();
  entry.estimated_cost_usd = null;
  entry.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await entry.save();
  return entry;
}

/** A project's query cost log, newest-first — not scoped to one environment, same "fold every environment into one admin view" convention as `IngestBatchModel`/`OrchestrationRunModel`. */
export async function listQueryCostLogEntriesForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_QUERY_COST_LOG_LIST_LIMIT,
): Promise<QueryCostLogEntryModel[]> {
  return QueryCostLogEntryModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('executed_at', 'desc')
    .limit(limit)
    .get();
}

export interface ProjectQueryQuotaStatus {
  allowed: boolean;
  /** Attempts left today, floored at 0. */
  remaining: number;
  limit: number;
  attemptedToday: number;
}

/**
 * How many of today's (UTC calendar day) cost-log entries count as a real
 * attempt against the quota — every outcome except `blocked_quota_exceeded`,
 * since a blocked attempt never got anywhere near a real (or would-be)
 * warehouse call. Filters `outcome` in code rather than as an equality
 * Firestore filter, since combining that with the `executed_at` range filter
 * used here would need a composite index this buildable-today deployment
 * doesn't provision.
 *
 * Bounded to `dailyQueryLimit + 1` documents (ordered oldest-first, the same
 * field the range filter is on, so no composite index needed for the order
 * either) rather than reading the whole day's log: once a project has spent
 * its quota, every further call for the rest of the day only ever adds
 * `blocked_quota_exceeded` entries, which never move `attemptedToday` — so
 * the non-blocked entries this function actually cares about can never
 * exceed `dailyQueryLimit` of them, and they're always the day's earliest
 * entries (blocking only starts once the limit is already reached). Reading
 * one past the limit is enough to distinguish "at capacity" from "one under"
 * without the read cost scaling with how many times an over-quota project
 * got blocked afterward — otherwise this guardrail would itself become an
 * unbounded-cost driver on a busy, over-quota project.
 *
 * `precomputedQuota` lets a caller that already fetched {@link getProjectCostQuota}
 * for its own purposes (e.g. the cost-guardrails admin page, which shows both
 * the quota config and today's usage) skip a second identical read.
 */
export async function checkProjectQueryQuota(
  organizationId: string,
  projectId: string,
  now: Date = new Date(),
  precomputedQuota?: ProjectCostQuota,
): Promise<ProjectQueryQuotaStatus> {
  const quota = precomputedQuota ?? (await getProjectCostQuota(organizationId, projectId));
  const startOfDayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const entriesToday = await QueryCostLogEntryModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('executed_at', '>=', startOfDayIso)
    .orderBy('executed_at', 'asc')
    .limit(quota.dailyQueryLimit + 1)
    .get();
  const attemptedToday = entriesToday.filter((entry) => entry.outcome !== 'blocked_quota_exceeded').length;

  return {
    allowed: attemptedToday < quota.dailyQueryLimit,
    remaining: Math.max(0, quota.dailyQueryLimit - attemptedToday),
    limit: quota.dailyQueryLimit,
    attemptedToday,
  };
}
