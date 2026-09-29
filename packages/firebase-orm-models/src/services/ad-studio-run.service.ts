import { randomUUID } from 'node:crypto';
import { isAdStudioImageFormat } from '@growthos/shared';
import {
  AD_STUDIO_RUN_STEPS,
  AdStudioRunModel,
  type AdStudioRunOptions,
  type AdStudioRunStep,
  type AdStudioRunStepId,
} from '../models/ad-studio-run.model';
import { AdStudioBriefModel } from '../models/ad-studio.model';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * Ad Studio autopilot runs: the record of one automated end-to-end pass over a brief. The engine
 * (`@growthos/ad-studio`) decides and performs each step; this keeps the state, the lease that stops
 * two pollers from advancing the same run at once, and the audit trail.
 */

export class AdStudioRunNotFoundError extends Error {
  constructor() {
    super('Ad Studio autopilot run not found.');
    this.name = 'AdStudioRunNotFoundError';
  }
}

export class AdStudioRunAlreadyActiveError extends Error {
  constructor(public readonly runId: string) {
    super('An autopilot run is already in progress for this ad.');
    this.name = 'AdStudioRunAlreadyActiveError';
  }
}

export class AdStudioRunOptionsInvalidError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`The autopilot options are not valid: ${reasons.join('; ')}`);
    this.name = 'AdStudioRunOptionsInvalidError';
  }
}

/** A run nobody advanced for this long is abandoned: a new one may start (the page was closed mid-run). */
export const AD_STUDIO_RUN_STALE_MS = 45 * 60_000;

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

function freshSteps(): AdStudioRunStep[] {
  return AD_STUDIO_RUN_STEPS.map((id) => ({ id, status: 'pending', reason: null, progress: null, started_on: null, finished_on: null }));
}

/** Checks and normalizes what the person asked the autopilot to do. */
export function normalizeAdStudioRunOptions(input: Partial<AdStudioRunOptions>): AdStudioRunOptions {
  const reasons: string[] = [];
  const imageFormats = input.imageFormats ?? ['square', 'portrait'];
  if (!Array.isArray(imageFormats) || imageFormats.some((format) => !isAdStudioImageFormat(format))) reasons.push('imageFormats must list known image formats');
  const images = input.images ?? true;
  const video = input.video ?? true;
  if (images && Array.isArray(imageFormats) && imageFormats.length === 0) reasons.push('imageFormats must list at least one format when images are on');
  if (!images && !video) reasons.push('turn on images, video or both');
  if (reasons.length) throw new AdStudioRunOptionsInvalidError(reasons);
  return {
    plan: input.plan ?? true,
    images,
    imageFormats: [...new Set(imageFormats)],
    video,
    environmentId: typeof input.environmentId === 'string' && input.environmentId.trim() ? input.environmentId.trim() : null,
    confirmPlan: input.confirmPlan ?? true,
  };
}

export async function listAdStudioRuns(organizationId: string, projectId: string, briefId: string): Promise<AdStudioRunModel[]> {
  const rows = await AdStudioRunModel.initPath(pathParams(organizationId, projectId)).where('brief_id', '==', briefId).get();
  return rows.sort((a, b) => b.started_on.localeCompare(a.started_on));
}

export async function getLatestAdStudioRun(organizationId: string, projectId: string, briefId: string): Promise<AdStudioRunModel | null> {
  return (await listAdStudioRuns(organizationId, projectId, briefId))[0] ?? null;
}

export async function getAdStudioRun(organizationId: string, projectId: string, briefId: string, runId: string): Promise<AdStudioRunModel> {
  const run = await AdStudioRunModel.init(runId, pathParams(organizationId, projectId));
  if (!run || run.brief_id !== briefId || run.organization_id !== organizationId || run.project_id !== projectId) throw new AdStudioRunNotFoundError();
  return run;
}

function isActive(run: AdStudioRunModel, now: Date): boolean {
  // A run waiting for its plan to be confirmed stays active: the person may take a while to review.
  if (run.status === 'awaiting_approval') return true;
  return run.status === 'running' && now.getTime() - new Date(run.last_advanced_on).getTime() < AD_STUDIO_RUN_STALE_MS;
}

/** Starts a run over a brief. Refuses while another run of the same brief is still being advanced. */
export async function startAdStudioRun(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  options: Partial<AdStudioRunOptions>;
  actorId: string;
  actorType?: 'user' | 'api_key';
  now?: Date;
}): Promise<AdStudioRunModel> {
  const now = params.now ?? new Date();
  const options = normalizeAdStudioRunOptions(params.options);
  const brief = await AdStudioBriefModel.init(params.briefId, pathParams(params.organizationId, params.projectId));
  if (!brief || brief.organization_id !== params.organizationId || brief.project_id !== params.projectId) throw new AdStudioRunNotFoundError();
  const latest = await getLatestAdStudioRun(params.organizationId, params.projectId, params.briefId);
  if (latest && isActive(latest, now)) throw new AdStudioRunAlreadyActiveError(latest.id);
  if (latest && latest.status === 'running') {
    // Abandoned mid-run (nobody polled it for a long time): close it so the history reads true.
    latest.status = 'cancelled';
    latest.failure_code = 'abandoned';
    latest.finished_on = now.toISOString();
    await latest.save();
  }

  const run = new AdStudioRunModel();
  run.organization_id = params.organizationId;
  run.project_id = params.projectId;
  run.brief_id = params.briefId;
  run.status = 'running';
  run.options = options;
  run.steps = freshSteps();
  run.lease_until = null;
  run.lease_token = null;
  run.started_by = params.actorId;
  run.started_on = now.toISOString();
  run.last_advanced_on = now.toISOString();
  run.setPathParams(pathParams(params.organizationId, params.projectId));
  await run.save();
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType ?? 'user',
      actorId: params.actorId,
      action: 'ad_studio.autopilot_started',
      targetType: 'ad_studio_brief',
      targetId: brief.id,
      summary: `Started the Ad Studio autopilot for "${brief.name}"`,
      after: { run_id: run.id, options },
    });
  } catch {
    // Best-effort.
  }
  return run;
}

/**
 * Takes the run's lease for `ttlMs` if no one holds an unexpired one and the run is still running;
 * returns the token, or null (another caller is advancing it right now, or it has finished).
 */
export async function acquireAdStudioRunLease(run: Pick<AdStudioRunModel, 'id' | 'organization_id' | 'project_id'>, params: { ttlMs: number; now?: Date }): Promise<string | null> {
  const now = params.now ?? new Date();
  const fresh = await AdStudioRunModel.init(run.id, pathParams(run.organization_id, run.project_id));
  if (!fresh || fresh.status !== 'running') return null;
  if (fresh.lease_until && fresh.lease_until > now.toISOString()) return null;
  const token = randomUUID();
  fresh.lease_token = token;
  fresh.lease_until = new Date(now.getTime() + params.ttlMs).toISOString();
  await fresh.save();
  const check = await AdStudioRunModel.init(run.id, pathParams(run.organization_id, run.project_id));
  return check?.lease_token === token ? token : null;
}

/** Saves the run's new state and gives the lease back. */
export async function saveAdStudioRunProgress(run: AdStudioRunModel, token: string, now: Date = new Date()): Promise<AdStudioRunModel> {
  const fresh = await AdStudioRunModel.init(run.id, pathParams(run.organization_id, run.project_id));
  if (!fresh || fresh.lease_token !== token) return fresh ?? run;
  if (fresh.status === 'cancelled') {
    // Cancelled while this step ran: keep the cancel, drop the lease.
    fresh.lease_token = null;
    fresh.lease_until = null;
    await fresh.save();
    return fresh;
  }
  run.lease_token = null;
  run.lease_until = null;
  run.last_advanced_on = now.toISOString();
  await run.save();
  return run;
}

export function runStep(run: AdStudioRunModel, id: AdStudioRunStepId): AdStudioRunStep {
  const step = run.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Run ${run.id} has no step ${id}`);
  return step;
}

export class AdStudioRunNotAwaitingApprovalError extends Error {
  constructor() {
    super('This autopilot run is not waiting for its plan to be confirmed.');
    this.name = 'AdStudioRunNotAwaitingApprovalError';
  }
}

/**
 * Confirms a run's plan (the plan, script and image ideas as they read now, including the person's
 * edits) and lets it go on to render. Audited: this is the moment spend on images and video starts.
 */
export async function approveAdStudioRunPlan(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  runId: string;
  actorId: string;
  actorType?: 'user' | 'api_key';
  now?: Date;
}): Promise<AdStudioRunModel> {
  const run = await getAdStudioRun(params.organizationId, params.projectId, params.briefId, params.runId);
  if (run.status !== 'awaiting_approval') throw new AdStudioRunNotAwaitingApprovalError();
  const now = (params.now ?? new Date()).toISOString();
  run.status = 'running';
  run.plan_approved_by = params.actorId;
  run.plan_approved_on = now;
  run.last_advanced_on = now;
  await run.save();
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType ?? 'user',
      actorId: params.actorId,
      action: 'ad_studio.plan_approved',
      targetType: 'ad_studio_brief',
      targetId: params.briefId,
      summary: 'Confirmed an Ad Studio plan; rendering can start',
      after: { run_id: run.id },
    });
  } catch {
    // Best-effort.
  }
  return run;
}

/** Stops a running run; the step in flight finishes but nothing further starts. */
export async function cancelAdStudioRun(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  runId: string;
  actorId: string;
  actorType?: 'user' | 'api_key';
  now?: Date;
}): Promise<AdStudioRunModel> {
  const run = await getAdStudioRun(params.organizationId, params.projectId, params.briefId, params.runId);
  if (run.status !== 'running' && run.status !== 'awaiting_approval') return run;
  const now = (params.now ?? new Date()).toISOString();
  run.status = 'cancelled';
  run.finished_on = now;
  for (const step of run.steps) {
    if (step.status === 'pending' || step.status === 'running') {
      step.status = 'skipped';
      step.reason = 'cancelled';
      step.finished_on = step.finished_on ?? now;
    }
  }
  await run.save();
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType ?? 'user',
      actorId: params.actorId,
      action: 'ad_studio.autopilot_cancelled',
      targetType: 'ad_studio_brief',
      targetId: params.briefId,
      summary: 'Cancelled an Ad Studio autopilot run',
      after: { run_id: run.id },
    });
  } catch {
    // Best-effort.
  }
  return run;
}

/** Removes every run record of a brief. */
export async function deleteAdStudioBriefRuns(organizationId: string, projectId: string, briefId: string): Promise<number> {
  const runs = await listAdStudioRuns(organizationId, projectId, briefId);
  await Promise.all(runs.map((run) => run.remove()));
  return runs.length;
}
