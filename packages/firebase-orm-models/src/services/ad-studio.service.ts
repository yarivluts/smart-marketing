import { randomUUID } from 'node:crypto';
import {
  AD_STUDIO_MAX_TOTAL_SECONDS,
  isAdStudioFormat,
  validateAdStudioScenes,
  type AdStudioBriefInput,
  type AdStudioPlan,
  type AdStudioPlanSources,
  type AdStudioScene,
  type AdStudioSceneIssue,
} from '@growthos/shared';
import {
  AdStudioBriefModel,
  AdStudioSettingsModel,
  AdStudioUsageModel,
  type AdStudioGeneratedBy,
  type AdStudioUsageKind,
} from '../models/ad-studio.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

/** Limits a project starts with until an admin changes them. */
export const AD_STUDIO_DEFAULT_DAILY_TEXT_GENERATIONS = 50;
export const AD_STUDIO_DEFAULT_DAILY_VIDEO_SECONDS = 300;
/** Upper bounds an admin can set, so a typo cannot open unlimited spend. */
export const AD_STUDIO_MAX_DAILY_TEXT_GENERATIONS = 1000;
export const AD_STUDIO_MAX_DAILY_VIDEO_SECONDS = 3600;

const SETTINGS_ID = 'settings';
const MIN_TARGET_SECONDS = 5;

export class AdStudioBriefInvalidError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`The brief is not valid: ${reasons.join('; ')}`);
    this.name = 'AdStudioBriefInvalidError';
  }
}

export class AdStudioBriefNotFoundError extends Error {
  constructor() {
    super('Ad Studio brief not found.');
    this.name = 'AdStudioBriefNotFoundError';
  }
}

export class AdStudioScriptInvalidError extends Error {
  constructor(public readonly issues: AdStudioSceneIssue[]) {
    super(`The script breaks ${issues.length} rule(s): ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'AdStudioScriptInvalidError';
  }
}

export class AdStudioQuotaExceededError extends Error {
  constructor(
    public readonly limitKind: 'text' | 'video',
    public readonly used: number,
    public readonly limit: number,
  ) {
    super(`The project's daily Ad Studio ${limitKind === 'text' ? 'AI text' : 'video seconds'} limit is reached (${used} of ${limit}).`);
    this.name = 'AdStudioQuotaExceededError';
  }
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

/** Trims and checks a brief; returns the normalized input or throws with every reason. */
export function normalizeAdStudioBriefInput(input: AdStudioBriefInput): AdStudioBriefInput {
  const reasons: string[] = [];
  const name = input.name?.trim() ?? '';
  const objective = input.objective?.trim() ?? '';
  const productDescription = input.productDescription?.trim() ?? '';
  const landingPageUrl = input.landingPageUrl?.trim() || null;
  const language = input.language?.trim().toLowerCase() ?? '';
  if (name.length === 0 || name.length > 120) reasons.push('name must be 1-120 characters');
  if (objective.length === 0 || objective.length > 2000) reasons.push('objective must be 1-2000 characters');
  if (productDescription.length === 0 || productDescription.length > 4000) reasons.push('productDescription must be 1-4000 characters');
  if (landingPageUrl !== null) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(landingPageUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) reasons.push('landingPageUrl must be an http(s) URL');
  }
  if (!isAdStudioFormat(input.format)) reasons.push('format must be vertical or horizontal');
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(language)) reasons.push('language must be a language code such as en or he');
  if (!Number.isInteger(input.targetSeconds) || input.targetSeconds < MIN_TARGET_SECONDS || input.targetSeconds > AD_STUDIO_MAX_TOTAL_SECONDS) {
    reasons.push(`targetSeconds must be a whole number from ${MIN_TARGET_SECONDS} to ${AD_STUDIO_MAX_TOTAL_SECONDS}`);
  }
  if (reasons.length) throw new AdStudioBriefInvalidError(reasons);
  return { name, objective, productDescription, landingPageUrl, format: input.format, language, targetSeconds: input.targetSeconds };
}

async function requireProject(organizationId: string, projectId: string): Promise<void> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) throw new ProjectNotFoundError();
}

export function adStudioBriefInput(brief: AdStudioBriefModel): AdStudioBriefInput {
  return {
    name: brief.name,
    objective: brief.objective,
    productDescription: brief.product_description,
    landingPageUrl: brief.landing_page_url ?? null,
    format: brief.video_format,
    language: brief.language,
    targetSeconds: brief.target_seconds,
  };
}

export async function createAdStudioBrief(params: {
  organizationId: string;
  projectId: string;
  input: AdStudioBriefInput;
  createdByUserId: string;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  await requireProject(params.organizationId, params.projectId);
  const input = normalizeAdStudioBriefInput(params.input);
  const stamp = nowIso(params.now);
  const brief = new AdStudioBriefModel();
  brief.organization_id = params.organizationId;
  brief.project_id = params.projectId;
  brief.name = input.name;
  brief.objective = input.objective;
  brief.product_description = input.productDescription;
  brief.landing_page_url = input.landingPageUrl;
  brief.video_format = input.format;
  brief.language = input.language;
  brief.target_seconds = input.targetSeconds;
  brief.status = 'draft';
  brief.scenes = [];
  brief.script_generated_by = null;
  brief.plan = null;
  brief.plan_sources = null;
  brief.plan_generated_by = null;
  brief.created_by = params.createdByUserId;
  brief.created_on = stamp;
  brief.last_changed_on = stamp;
  brief.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await brief.save();
  return brief;
}

export async function getAdStudioBrief(organizationId: string, projectId: string, briefId: string): Promise<AdStudioBriefModel> {
  const brief = await AdStudioBriefModel.init(briefId, { organization_id: organizationId, project_id: projectId });
  if (!brief || brief.project_id !== projectId) throw new AdStudioBriefNotFoundError();
  return brief;
}

export async function listAdStudioBriefs(organizationId: string, projectId: string): Promise<AdStudioBriefModel[]> {
  return AdStudioBriefModel.initPath({ organization_id: organizationId, project_id: projectId }).query().orderBy('created_on', 'desc').limit(100).get();
}

export async function updateAdStudioBriefDetails(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  input: AdStudioBriefInput;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  const input = normalizeAdStudioBriefInput(params.input);
  brief.name = input.name;
  brief.objective = input.objective;
  brief.product_description = input.productDescription;
  brief.landing_page_url = input.landingPageUrl;
  brief.video_format = input.format;
  brief.language = input.language;
  brief.target_seconds = input.targetSeconds;
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Saves a whole script. It must pass every scene rule - an AI-written script is fitted by the
 * caller before it gets here, a person's edit is rejected with the broken rules so the editor can
 * show them. `generatedBy` marks an AI-written script; a person's save clears it.
 */
export async function saveAdStudioScript(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  scenes: AdStudioScene[];
  generatedBy?: AdStudioGeneratedBy | null;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const issues = validateAdStudioScenes(params.scenes);
  if (issues.length) throw new AdStudioScriptInvalidError(issues);
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  brief.scenes = params.scenes.map((scene) => ({ ...scene }));
  brief.script_generated_by = params.generatedBy ?? null;
  brief.status = 'scripted';
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Stores a plan with the evidence it was built from, replacing any earlier plan. The brief reads as
 * `planned` unless it already has a script, which stays `scripted`: a new plan does not undo work.
 */
export async function saveAdStudioPlan(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  plan: AdStudioPlan;
  sources: AdStudioPlanSources;
  generatedBy: AdStudioGeneratedBy;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  // A JSON round trip drops any `undefined` Firestore would refuse, and detaches the caller's objects.
  brief.plan = JSON.parse(JSON.stringify(params.plan)) as AdStudioPlan;
  brief.plan_sources = JSON.parse(JSON.stringify(params.sources)) as AdStudioPlanSources;
  brief.plan_generated_by = { ...params.generatedBy };
  if (brief.status !== 'scripted') brief.status = 'planned';
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

export async function deleteAdStudioBrief(params: { organizationId: string; projectId: string; briefId: string; actorId: string }): Promise<void> {
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  await brief.remove();
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'ad_studio.brief_deleted',
      targetType: 'ad_studio_brief',
      targetId: params.briefId,
      summary: `Deleted Ad Studio brief "${brief.name}"`,
    });
  } catch {
    // Best-effort, like every other audit write.
  }
}

export function newAdStudioSceneId(): string {
  return randomUUID();
}

export interface AdStudioSettingsView {
  dailyTextGenerations: number;
  dailyVideoSeconds: number;
  /** False while the project is still on the defaults. */
  customized: boolean;
  lastChangedOn: string | null;
}

export async function getAdStudioSettings(organizationId: string, projectId: string): Promise<AdStudioSettingsView> {
  const settings = await AdStudioSettingsModel.init(SETTINGS_ID, { organization_id: organizationId, project_id: projectId });
  if (!settings) {
    return {
      dailyTextGenerations: AD_STUDIO_DEFAULT_DAILY_TEXT_GENERATIONS,
      dailyVideoSeconds: AD_STUDIO_DEFAULT_DAILY_VIDEO_SECONDS,
      customized: false,
      lastChangedOn: null,
    };
  }
  return {
    dailyTextGenerations: settings.daily_text_generations,
    dailyVideoSeconds: settings.daily_video_seconds,
    customized: true,
    lastChangedOn: settings.last_changed_on,
  };
}

export async function setAdStudioSettings(params: {
  organizationId: string;
  projectId: string;
  dailyTextGenerations: number;
  dailyVideoSeconds: number;
  actorId: string;
  now?: Date;
}): Promise<AdStudioSettingsView> {
  const reasons: string[] = [];
  if (!Number.isInteger(params.dailyTextGenerations) || params.dailyTextGenerations < 0 || params.dailyTextGenerations > AD_STUDIO_MAX_DAILY_TEXT_GENERATIONS) {
    reasons.push(`dailyTextGenerations must be a whole number from 0 to ${AD_STUDIO_MAX_DAILY_TEXT_GENERATIONS}`);
  }
  if (!Number.isInteger(params.dailyVideoSeconds) || params.dailyVideoSeconds < 0 || params.dailyVideoSeconds > AD_STUDIO_MAX_DAILY_VIDEO_SECONDS) {
    reasons.push(`dailyVideoSeconds must be a whole number from 0 to ${AD_STUDIO_MAX_DAILY_VIDEO_SECONDS}`);
  }
  if (reasons.length) throw new AdStudioBriefInvalidError(reasons);
  await requireProject(params.organizationId, params.projectId);

  const before = await getAdStudioSettings(params.organizationId, params.projectId);
  const existing = await AdStudioSettingsModel.init(SETTINGS_ID, { organization_id: params.organizationId, project_id: params.projectId });
  const settings = existing ?? new AdStudioSettingsModel();
  settings.organization_id = params.organizationId;
  settings.project_id = params.projectId;
  settings.daily_text_generations = params.dailyTextGenerations;
  settings.daily_video_seconds = params.dailyVideoSeconds;
  settings.changed_by = params.actorId;
  settings.last_changed_on = nowIso(params.now);
  settings.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await (existing ? settings.save() : settings.save(SETTINGS_ID));
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'ad_studio.limits_changed',
      targetType: 'ad_studio_settings',
      targetId: params.projectId,
      summary: `Set Ad Studio daily limits to ${params.dailyTextGenerations} AI text calls and ${params.dailyVideoSeconds}s of video`,
      before: { daily_text_generations: before.dailyTextGenerations, daily_video_seconds: before.dailyVideoSeconds },
      after: { daily_text_generations: params.dailyTextGenerations, daily_video_seconds: params.dailyVideoSeconds },
    });
  } catch {
    // Best-effort.
  }
  return getAdStudioSettings(params.organizationId, params.projectId);
}

export function utcDay(now?: Date): string {
  return nowIso(now).slice(0, 10);
}

const VIDEO_KINDS: ReadonlySet<AdStudioUsageKind> = new Set(['video_scene', 'video_edit']);

export interface AdStudioUsageToday {
  day: string;
  textGenerations: number;
  videoSeconds: number;
}

export async function getAdStudioUsageToday(organizationId: string, projectId: string, now?: Date): Promise<AdStudioUsageToday> {
  const day = utcDay(now);
  const rows = await AdStudioUsageModel.initPath({ organization_id: organizationId, project_id: projectId }).where('day', '==', day).get();
  let textGenerations = 0;
  let videoSeconds = 0;
  for (const row of rows) {
    if (VIDEO_KINDS.has(row.kind)) videoSeconds += row.units;
    else textGenerations += row.units;
  }
  return { day, textGenerations, videoSeconds };
}

/**
 * Throws {@link AdStudioQuotaExceededError} when a call of `kind` using `units` would pass the
 * project's daily limit. Checked before calling a provider, so a refused call costs nothing.
 */
export async function assertAdStudioQuota(params: { organizationId: string; projectId: string; kind: AdStudioUsageKind; units: number; now?: Date }): Promise<void> {
  const [settings, usage] = await Promise.all([
    getAdStudioSettings(params.organizationId, params.projectId),
    getAdStudioUsageToday(params.organizationId, params.projectId, params.now),
  ]);
  if (VIDEO_KINDS.has(params.kind)) {
    if (usage.videoSeconds + params.units > settings.dailyVideoSeconds) throw new AdStudioQuotaExceededError('video', usage.videoSeconds, settings.dailyVideoSeconds);
  } else if (usage.textGenerations + params.units > settings.dailyTextGenerations) {
    throw new AdStudioQuotaExceededError('text', usage.textGenerations, settings.dailyTextGenerations);
  }
}

export async function recordAdStudioUsage(params: {
  organizationId: string;
  projectId: string;
  kind: AdStudioUsageKind;
  provider: string;
  model: string;
  units: number;
  briefId?: string | null;
  actorId: string;
  outcome: 'succeeded' | 'failed';
  failureReason?: string | null;
  now?: Date;
}): Promise<AdStudioUsageModel> {
  const row = new AdStudioUsageModel();
  row.organization_id = params.organizationId;
  row.project_id = params.projectId;
  row.kind = params.kind;
  row.provider = params.provider;
  row.model = params.model;
  row.units = params.units;
  row.brief_id = params.briefId ?? null;
  row.actor_id = params.actorId;
  row.outcome = params.outcome;
  row.failure_reason = params.failureReason ?? null;
  row.occurred_on = nowIso(params.now);
  row.day = utcDay(params.now);
  row.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await row.save();
  return row;
}

export async function listAdStudioUsage(organizationId: string, projectId: string, limit = 50): Promise<AdStudioUsageModel[]> {
  return AdStudioUsageModel.initPath({ organization_id: organizationId, project_id: projectId }).query().orderBy('occurred_on', 'desc').limit(limit).get();
}
