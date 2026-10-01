import { assemblyPlan, sceneVideoStates, summarizeVideoProgress } from '@growthos/shared';
import {
  acquireAdStudioRunLease,
  AdStudioQuotaExceededError,
  getAdStudioBrief,
  getAdStudioRun,
  getAdStudioSettings,
  listAdStudioClips,
  listAdStudioImages,
  listAdStudioVideos,
  listEnvironmentsForProject,
  runStep,
  saveAdStudioRunProgress,
  startAdStudioRun,
  type AdStudioBriefModel,
  type AdStudioRunModel,
  type AdStudioRunOptions,
  type AdStudioRunStep,
  type AdStudioRunStepId,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { AdStudioProviderError, resolveAdStudioLlm, type AdStudioLlm } from './llm';
import { planAdStudioBrief } from './planning';
import { generateAdStudioScript } from './script-generation';
import { generateAdStudioImageConcepts, renderAdStudioConceptImage, toAdStudioImageView, type AdStudioImageDeps } from './image-pipeline';
import { advanceBriefVideo, assembleBriefVideo, startRenderAll, startSceneRender, toAdStudioClipView, toAdStudioVideoView, type AdStudioVideoDeps } from './video-pipeline';
import { adStudioImageSlots, currentAssembledVideo, missingImageRenders, type AdStudioClipView, type AdStudioRunView } from './view';

/**
 * The Ad Studio autopilot: one automated pass from brief to finished creatives - plan, script,
 * image ideas, images, video clips, assembled video. Exporting stays a deliberate act.
 *
 * It advances one small unit of work per call (a plan, a script, one image, one poll of the clips,
 * the assembly), so no request waits minutes and both the page's poll and an MCP client can drive
 * it. Each step does only what is missing: a plan, script, idea, image or clip that exists - or that
 * the person edited - is kept, and after an edit a new run redoes only the stale parts. A lease stops
 * two callers from advancing the same run at once.
 */

/** Long enough for the slowest single unit (assembling a 60-second video). */
const LEASE_MS = 10 * 60_000;

export interface AdStudioAutopilotDeps {
  /** The video model is null when none is configured; the clip step then fails with `not_configured`. */
  video: Omit<AdStudioVideoDeps, 'omni'> & { omni: AdStudioVideoDeps['omni'] | null };
  images: AdStudioImageDeps;
  /** The text model; null when none is configured. */
  llm: AdStudioLlm | null;
  now?: () => Date;
}

export function resolveAdStudioAutopilotDeps(video: AdStudioAutopilotDeps['video'], images: AdStudioImageDeps, env: NodeJS.ProcessEnv = process.env): AdStudioAutopilotDeps {
  return { video, images, llm: resolveAdStudioLlm(env) };
}

export function toAdStudioRunView(run: AdStudioRunModel): AdStudioRunView {
  return {
    id: run.id,
    status: run.status,
    options: { ...run.options, imageFormats: [...run.options.imageFormats], confirmPlan: run.options.confirmPlan ?? false },
    steps: run.steps.map((step) => ({ id: step.id, status: step.status, reason: step.reason, progress: step.progress })),
    failureCode: run.failure_code ?? null,
    failureMessage: run.failure_message ?? null,
    startedOn: run.started_on,
    lastAdvancedOn: run.last_advanced_on,
    finishedOn: run.finished_on ?? null,
    planApprovedOn: run.plan_approved_on ?? null,
  };
}

interface RunContext {
  organizationId: string;
  projectId: string;
  briefId: string;
  actorId: string;
  actorType?: 'user' | 'api_key';
}

export async function startAdStudioAutopilot(ctx: RunContext & { options: Partial<AdStudioRunOptions> }): Promise<AdStudioRunModel> {
  await ensureOrm();
  return startAdStudioRun({ ...ctx, options: ctx.options });
}

function finishStep(step: AdStudioRunStep, status: 'done' | 'skipped' | 'failed', reason: string | null, at: string): void {
  step.status = status;
  step.reason = reason;
  step.started_on = step.started_on ?? at;
  step.finished_on = at;
}

function failureReason(error: unknown): string {
  if (error instanceof AdStudioQuotaExceededError) return 'quota_exceeded';
  if (error instanceof AdStudioProviderError) return error.code;
  return 'error';
}

async function environmentFor(ctx: RunContext, environmentId: string | null): Promise<{ id: string; name: string } | null> {
  const environments = await listEnvironmentsForProject(ctx.organizationId, ctx.projectId);
  const chosen = (environmentId ? environments.find((environment) => environment.id === environmentId) : undefined) ?? environments.find((environment) => environment.name === 'prod') ?? environments[0];
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}

type StepResult = { status: 'done' | 'skipped' | 'failed'; reason: string | null; progress?: { done: number; total: number } | null } | { status: 'running'; progress: { done: number; total: number } | null };

/** Does the next unit of one step. Returns `running` when the step needs more calls. */
async function advanceStep(id: AdStudioRunStepId, run: AdStudioRunModel, brief: AdStudioBriefModel, ctx: RunContext, deps: AdStudioAutopilotDeps): Promise<StepResult> {
  const options = run.options;
  const callCtx = (llm: AdStudioLlm) => ({ organizationId: ctx.organizationId, projectId: ctx.projectId, actorId: ctx.actorId, llm, briefId: brief.id, now: deps.now?.() });

  switch (id) {
    case 'plan': {
      if (!options.plan) return { status: 'skipped', reason: 'off' };
      if (brief.plan) return { status: 'skipped', reason: 'already_done' };
      if (!deps.llm) return { status: 'failed', reason: 'not_configured' };
      await planAdStudioBrief({ ...callCtx(deps.llm), environment: await environmentFor(ctx, options.environmentId) });
      return { status: 'done', reason: null };
    }
    case 'script': {
      if (!options.video) return { status: 'skipped', reason: 'off' };
      if (brief.scenes.length > 0) return { status: 'skipped', reason: 'already_done' };
      if (!deps.llm) return { status: 'failed', reason: 'not_configured' };
      await generateAdStudioScript(callCtx(deps.llm));
      return { status: 'done', reason: null };
    }
    case 'image_concepts': {
      if (!options.images) return { status: 'skipped', reason: 'off' };
      if ((brief.image_concepts ?? []).length > 0) return { status: 'skipped', reason: 'already_done' };
      if (!deps.llm) return { status: 'failed', reason: 'not_configured' };
      await generateAdStudioImageConcepts({ ...callCtx(deps.llm), formats: options.imageFormats });
      return { status: 'done', reason: null };
    }
    case 'images': {
      if (!options.images) return { status: 'skipped', reason: 'off' };
      const concepts = brief.image_concepts ?? [];
      if (concepts.length === 0) return { status: 'skipped', reason: 'no_concepts' };
      const images = (await listAdStudioImages(ctx.organizationId, ctx.projectId, brief.id)).map(toAdStudioImageView);
      const slots = adStudioImageSlots(concepts, images, brief.language);
      const missing = missingImageRenders(slots, concepts, brief.language, run.started_on);
      const progress = { done: slots.filter((slot) => slot.current).length, total: slots.length };
      if (missing.length === 0) {
        const failed = slots.filter((slot) => !slot.current).length;
        return failed > 0 ? { status: 'failed', reason: 'some_images_failed', progress } : { status: 'done', reason: null, progress };
      }
      if (!deps.images.images) return { status: 'failed', reason: 'not_configured', progress };
      try {
        await renderAdStudioConceptImage({ ...ctx, briefId: brief.id, conceptId: missing[0].conceptId, format: missing[0].format }, deps.images);
      } catch (error) {
        // A spent limit or a billing refusal refuses every image: stop the step. Anything else is
        // recorded on that image and the next slot is tried on the next call.
        const reason = failureReason(error);
        if (reason === 'quota_exceeded' || reason === 'provider_billing' || reason === 'not_configured') return { status: 'failed', reason, progress };
      }
      return { status: 'running', progress: { done: progress.done + 1, total: progress.total } };
    }
    case 'clips': {
      if (!options.video) return { status: 'skipped', reason: 'off' };
      if (brief.scenes.length === 0) return { status: 'skipped', reason: 'no_script' };
      const context = { format: brief.video_format, language: brief.language };
      let clips = (await listAdStudioClips(ctx.organizationId, ctx.projectId, brief.id)).map(toAdStudioClipView);
      let progress = summarizeVideoProgress(sceneVideoStates(brief.scenes, clips, context), brief.scenes);
      const omni = deps.video.omni;
      if (progress.rendered === progress.scenes) return clipsQualityGate(run, brief, ctx, deps, clips);
      if (!omni) return { status: 'failed', reason: 'not_configured', progress: { done: progress.rendered, total: progress.scenes } };
      const videoDeps = { ...deps.video, omni };
      if (progress.generating > 0) {
        clips = (await advanceBriefVideo({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id }, videoDeps)).clips;
        progress = summarizeVideoProgress(sceneVideoStates(brief.scenes, clips, context), brief.scenes);
        if (progress.rendered === progress.scenes) return clipsQualityGate(run, brief, ctx, deps, clips);
        if (progress.generating > 0) return { status: 'running', progress: { done: progress.rendered, total: progress.scenes } };
      }
      // Nothing in flight and scenes still missing: render them once per run; a scene that already
      // failed in this run stops the step (the person fixes or retries it, then runs again).
      const failedThisRun = clips.some((clip) => clip.status === 'failed' && clip.requestedOn >= run.started_on);
      if (failedThisRun) return { status: 'failed', reason: 'clip_failed', progress: { done: progress.rendered, total: progress.scenes } };
      // startRenderAll vocalizes Hebrew narration it is about to render (KAN-239).
      await startRenderAll({ ...ctx, briefId: brief.id }, { ...videoDeps, llm: videoDeps.llm ?? deps.llm });
      return { status: 'running', progress: { done: progress.rendered, total: progress.scenes } };
    }
    case 'assemble': {
      if (!options.video) return { status: 'skipped', reason: 'off' };
      if (brief.scenes.length === 0) return { status: 'skipped', reason: 'no_script' };
      const context = { format: brief.video_format, language: brief.language };
      const clips = (await listAdStudioClips(ctx.organizationId, ctx.projectId, brief.id)).map(toAdStudioClipView);
      const plan = assemblyPlan(brief.scenes, clips, context);
      if (!plan) return { status: 'failed', reason: 'clips_not_ready' };
      const videos = (await listAdStudioVideos(ctx.organizationId, ctx.projectId, brief.id)).map(toAdStudioVideoView);
      if (currentAssembledVideo(videos, plan.map((entry) => entry.clip.id)).current) return { status: 'skipped', reason: 'already_done' };
      await assembleBriefVideo({ ...ctx, briefId: brief.id }, deps.video);
      return { status: 'done', reason: null };
    }
    default:
      return { status: 'skipped', reason: 'unknown_step' };
  }
}

/**
 * Once every scene has a clip: wait for the AI quality check of each current clip (the status poll
 * runs one check per call), then re-render a scene whose clip has a major problem, while the project's
 * retry count allows. Done when every current clip is checked, with reason qa_issues when a problem remains, so
 * the person sees which scenes to look at - the video is still assembled rather than held forever.
 */
async function clipsQualityGate(
  run: AdStudioRunModel,
  brief: AdStudioBriefModel,
  ctx: RunContext,
  deps: AdStudioAutopilotDeps,
  clips: AdStudioClipView[],
): Promise<StepResult> {
  const context = { format: brief.video_format, language: brief.language };
  const total = brief.scenes.length;
  const ids = { organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id };
  let states = sceneVideoStates(brief.scenes, clips, context);
  // A scene keeps its older clip as usable while a re-render of it is still in flight: wait for that
  // render (and its check) instead of finishing on the old clip.
  if (deps.video.omni && summarizeVideoProgress(states, brief.scenes).generating > 0) {
    states = sceneVideoStates(brief.scenes, (await advanceBriefVideo(ids, { ...deps.video, omni: deps.video.omni })).clips, context);
    if (summarizeVideoProgress(states, brief.scenes).generating > 0) return { status: 'running', progress: { done: total - 1, total } };
  }
  const unchecked = () => states.filter((state) => state.usable && !state.usable.qa).length;
  if (unchecked() > 0 && deps.video.omni) {
    states = sceneVideoStates(brief.scenes, (await advanceBriefVideo(ids, { ...deps.video, omni: deps.video.omni })).clips, context);
    if (unchecked() > 0) return { status: 'running', progress: { done: total - unchecked(), total } };
  }
  const failing = states.filter((state) => state.usable?.qa?.status === 'issues');
  const settings = await getAdStudioSettings(ctx.organizationId, ctx.projectId);
  const used = run.qa_retries ?? {};
  const retry = settings.videoQa.enabled && deps.video.omni ? failing.find((state) => (used[state.sceneId] ?? 0) < settings.videoQa.retries) : undefined;
  if (retry && deps.video.omni) {
    run.qa_retries = { ...used, [retry.sceneId]: (used[retry.sceneId] ?? 0) + 1 };
    await startSceneRender({ ...ctx, briefId: brief.id, sceneId: retry.sceneId }, { ...deps.video, omni: deps.video.omni });
    return { status: 'running', progress: { done: total - 1, total } };
  }
  return { status: 'done', reason: failing.length ? 'qa_issues' : null, progress: { done: total, total } };
}

/** Steps that render media - the costly part a confirmed plan unlocks. */
const RENDER_STEPS: ReadonlySet<AdStudioRunStepId> = new Set(['images', 'clips', 'assemble']);

/** Steps whose failure stops the run: without a script or its clips there is no video to finish. */
const BLOCKING: ReadonlySet<AdStudioRunStepId> = new Set(['script', 'clips', 'assemble']);

/**
 * Advances a run by one unit of work and returns it. A caller that finds the run leased (someone
 * else is advancing it) or finished gets it back unchanged.
 */
export async function advanceAdStudioAutopilot(ctx: RunContext & { runId: string }, deps: AdStudioAutopilotDeps): Promise<AdStudioRunModel> {
  await ensureOrm();
  const now = deps.now ?? (() => new Date());
  const run = await getAdStudioRun(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.runId);
  if (run.status !== 'running') return run;
  const token = await acquireAdStudioRunLease(run, { ttlMs: LEASE_MS, now: now() });
  if (!token) return getAdStudioRun(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.runId);
  const working = await getAdStudioRun(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.runId);

  const step = working.steps.find((candidate) => candidate.status === 'pending' || candidate.status === 'running');
  if (!step) {
    working.status = working.steps.some((candidate) => candidate.status === 'failed' && BLOCKING.has(candidate.id)) ? 'failed' : 'done';
    working.finished_on = now().toISOString();
    return saveAdStudioRunProgress(working, token, now());
  }

  // The plan gate: with `confirmPlan`, nothing is rendered until the person confirmed the plan,
  // script and image ideas (they may edit them first). The run waits here, lease released.
  if (RENDER_STEPS.has(step.id) && working.options.confirmPlan && !working.plan_approved_on) {
    working.status = 'awaiting_approval';
    return saveAdStudioRunProgress(working, token, now());
  }

  const at = now().toISOString();
  step.started_on = step.started_on ?? at;
  try {
    const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
    const result = await advanceStep(step.id, working, brief, ctx, deps);
    if (result.status === 'running') {
      step.status = 'running';
      step.progress = result.progress;
    } else {
      finishStep(step, result.status, result.reason, now().toISOString());
      if (result.progress !== undefined) step.progress = result.progress;
    }
  } catch (error) {
    finishStep(step, 'failed', failureReason(error), now().toISOString());
    if (BLOCKING.has(step.id)) {
      working.failure_code = failureReason(error);
      working.failure_message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    }
  }

  if (step.status === 'failed' && BLOCKING.has(step.id)) {
    // Nothing after a failed script or clip step can succeed: close the run with the remaining steps skipped.
    for (const later of working.steps) {
      if (later.status === 'pending') finishStep(later, 'skipped', 'blocked', now().toISOString());
    }
    working.status = 'failed';
    working.failure_code = working.failure_code ?? step.reason;
    working.finished_on = now().toISOString();
  } else if (!working.steps.some((candidate) => candidate.status === 'pending' || candidate.status === 'running')) {
    working.status = 'done';
    working.finished_on = now().toISOString();
  }
  return saveAdStudioRunProgress(working, token, now());
}

/** A step of a run by id (for callers that show one step). */
export function adStudioRunStep(run: AdStudioRunModel, id: AdStudioRunStepId): AdStudioRunStep {
  return runStep(run, id);
}
