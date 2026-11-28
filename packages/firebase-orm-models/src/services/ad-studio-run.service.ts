import { randomUUID } from 'node:crypto';
import { isAdStudioImageFormat } from '@growthos/shared';
import {
  AD_STUDIO_RUN_TARGETS,
  AdStudioRunModel,
  type AdStudioRunOptions,
  type AdStudioRunStep,
  type AdStudioRunStepId,
  AdStudioRunIndexModel,
} from '../models/ad-studio-run.model';
import { AdStudioBriefModel } from '../models/ad-studio.model';
import { recordAuditLogEntry } from './audit-log.service';
import { emitActivityEvent } from './activity-events.service';

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

const CLASSIC_RUN_STEPS: readonly AdStudioRunStepId[] = ['plan', 'script', 'image_concepts', 'images', 'clips', 'assemble'];
const MAX_RUN_INSTRUCTION_CHARS = 600;

function makeStep(id: AdStudioRunStepId): AdStudioRunStep {
  return { id, status: 'pending', reason: null, progress: null, started_on: null, finished_on: null };
}

function freshSteps(options: AdStudioRunOptions): AdStudioRunStep[] {
  if ((!options.target || options.target === 'all') && !options.siteEnrich && !options.search && !options.instruction) {
    return CLASSIC_RUN_STEPS.map(makeStep);
  }
  const ids: AdStudioRunStepId[] = [];
  if (options.siteEnrich) ids.push('site_enrich');
  if (options.instruction) {
    ids.push('revise');
    if (options.target === 'video' || (!options.target && options.video)) {
      ids.push('clips', 'assemble');
    }
    if (options.target === 'images' || options.target === 'image' || (!options.target && options.images)) {
      ids.push('images');
    }
  } else {
    if (options.plan) ids.push('plan');
    if (options.video) ids.push('script');
    if (options.images) {
      if (options.target !== 'image' || !options.targetConceptId) {
        ids.push('image_concepts');
      }
      ids.push('images');
    }
    if (options.video) ids.push('clips', 'assemble');
    if (options.search) ids.push('search_keywords', 'search_ad');
  }
  return ids.map(makeStep);
}

/** Checks and normalizes what the person asked the autopilot to do. */
export function normalizeAdStudioRunOptions(input: Partial<AdStudioRunOptions>): AdStudioRunOptions {
  const reasons: string[] = [];
  const imageFormats = input.imageFormats ?? ['square', 'portrait'];
  if (!Array.isArray(imageFormats) || imageFormats.some((format) => !isAdStudioImageFormat(format))) reasons.push('imageFormats must list known image formats');
  const images = input.images ?? true;
  const video = input.video ?? true;
  const search = input.search;
  const target = input.target;
  if (target !== undefined && !(AD_STUDIO_RUN_TARGETS as readonly string[]).includes(target)) {
    reasons.push('target must be a valid ad studio run target');
  }
  let instruction = '';
  if (input.instruction !== undefined && input.instruction !== null) {
    if (typeof input.instruction !== 'string') {
      reasons.push('instruction must be a string');
    } else {
      instruction = input.instruction.trim();
      if (instruction.length > MAX_RUN_INSTRUCTION_CHARS) {
        reasons.push(`instruction must be at most ${MAX_RUN_INSTRUCTION_CHARS} characters`);
      }
    }
  }
  if (images && Array.isArray(imageFormats) && imageFormats.length === 0) reasons.push('imageFormats must list at least one format when images are on');
  if (!images && !video && !search && !instruction) reasons.push('turn on images, video, search or provide an instruction');
  if (reasons.length) throw new AdStudioRunOptionsInvalidError(reasons);

  const normalized: AdStudioRunOptions = {
    plan: input.plan ?? true,
    images,
    imageFormats: [...new Set(imageFormats)],
    video,
    environmentId: typeof input.environmentId === 'string' && input.environmentId.trim() ? input.environmentId.trim() : null,
    confirmPlan: input.confirmPlan ?? true,
  };
  if (input.siteEnrich !== undefined) normalized.siteEnrich = Boolean(input.siteEnrich);
  if (search !== undefined) normalized.search = Boolean(search);
  if (target !== undefined) normalized.target = target;
  const targetConceptId = typeof input.targetConceptId === 'string' && input.targetConceptId.trim() ? input.targetConceptId.trim() : null;
  if (targetConceptId) normalized.targetConceptId = targetConceptId;
  const siteUrl = typeof input.siteUrl === 'string' && input.siteUrl.trim() ? input.siteUrl.trim() : null;
  if (siteUrl) normalized.siteUrl = siteUrl;
  if (instruction) normalized.instruction = instruction;
  if (input.notifyAlways !== undefined) normalized.notifyAlways = Boolean(input.notifyAlways);
  return normalized;
}

function runsConflict(a: AdStudioRunOptions, b: AdStudioRunOptions): boolean {
  const targetA = a.target ?? 'all';
  const targetB = b.target ?? 'all';
  if (targetA === 'all' || targetB === 'all') return true;
  if (targetA === targetB) {
    if (targetA === 'image') {
      return !a.targetConceptId || !b.targetConceptId || a.targetConceptId === b.targetConceptId;
    }
    return true;
  }
  if ((targetA === 'images' && targetB === 'image') || (targetA === 'image' && targetB === 'images')) {
    return true;
  }
  return false;
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
  const existingRuns = await listAdStudioRuns(params.organizationId, params.projectId, params.briefId);
  const activeConflict = existingRuns.find((candidate) => isActive(candidate, now) && runsConflict(candidate.options, options));
  if (activeConflict) throw new AdStudioRunAlreadyActiveError(activeConflict.id);
  for (const stale of existingRuns) {
    if (!isActive(stale, now) && stale.status === 'running') {
      // Abandoned mid-run (nobody polled it for a long time): close it so the history reads true.
      stale.status = 'cancelled';
      stale.failure_code = 'abandoned';
      stale.finished_on = now.toISOString();
      await stale.save();
    }
  }

  const run = new AdStudioRunModel();
  run.organization_id = params.organizationId;
  run.project_id = params.projectId;
  run.brief_id = params.briefId;
  run.status = 'running';
  run.options = options;
  run.steps = freshSteps(options);
  run.lease_until = null;
  run.lease_token = null;
  run.started_by = params.actorId;
  run.started_on = now.toISOString();
  run.last_advanced_on = now.toISOString();
  run.setPathParams(pathParams(params.organizationId, params.projectId));
  await run.save();
  const line = new AdStudioRunIndexModel();
  line.organization_id = params.organizationId;
  line.project_id = params.projectId;
  line.brief_id = params.briefId;
  line.run_id = run.id;
  line.started_by = params.actorId;
  line.started_on = run.started_on;
  await line.save(run.id);
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
  // Only the lease holder gets here, so a run that just stopped to wait, finished or failed is
  // announced exactly once.
  const ev = runEventFor(run);
  if (ev && fresh.status !== run.status) {
    await emitActivityEvent({
      source: 'ad_studio',
      kind: ev.kind,
      organizationId: run.organization_id,
      projectId: run.project_id,
      // The run got here by itself, not by anyone's click: the person who started it hears too.
      actor: 'autopilot',
      briefId: run.brief_id,
      ...(ev.item ? { item: ev.item } : {}),
      ...(run.options.notifyAlways ? { forceNotify: true } : {}),
    });
  }
  return run;
}

function runEventFor(run: AdStudioRunModel): { kind: string; item?: string } | null {
  if (run.status === 'awaiting_approval') return { kind: 'run_awaiting_approval' };
  if (run.status !== 'done' && run.status !== 'failed') return null;
  const suffix = run.status === 'done' ? 'done' : 'failed';
  const target = run.options.target;
  if (target === 'video') return { kind: `video_${suffix}`, item: 'video' };
  if (target === 'search') return { kind: `search_${suffix}`, item: 'search' };
  if (target === 'images') return { kind: `images_${suffix}`, item: 'images' };
  if (target === 'image') {
    return {
      kind: `images_${suffix}`,
      item: run.options.targetConceptId ? `image:${run.options.targetConceptId}` : 'images',
    };
  }
  return { kind: `run_${suffix}` };
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

/** The autopilot runs that have not finished, oldest first: what the scheduler keeps moving. */
export async function listAdStudioRunIndex(): Promise<AdStudioRunIndexModel[]> {
  const rows = await AdStudioRunIndexModel.getAll();
  return [...rows].sort((a, b) => a.started_on.localeCompare(b.started_on));
}

/** Drops a run's line once it has finished (or no longer exists). */
export async function removeAdStudioRunIndex(runId: string): Promise<void> {
  const line = await AdStudioRunIndexModel.init(runId);
  if (line) await line.remove();
}
