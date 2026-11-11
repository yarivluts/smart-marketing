import { randomUUID } from 'node:crypto';
import {
  AD_STUDIO_MAX_TOTAL_SECONDS,
  adCopyIssues,
  fitHeadlineEmphasis,
  isAdCopyEmpty,
  isAdStudioFormat,
  reconcilePronunciations,
  speakerFields,
  AD_STUDIO_SPEAKER_MAX,
  applyNarrationMode,
  isAdStudioNarrationMode,
  resolveNarrationMode,
  type AdStudioNarrationMode,
  voiceIssue,
  videoSettingsIssue,
  searchKeywordsIssues,
  normalizeSearchKeywords,
  searchAdIssues,
  normalizeSearchAd,
  normalizeVideoSettings,
  isDefaultVideoSettings,
  isAdStudioImageSize,
  DEFAULT_AD_STUDIO_IMAGE_SIZE,
  type AdStudioImageSize,
  validateAdStudioImageConcepts,
  validateAdStudioScenes,
  type AdStudioAdCopy,
  type AdStudioVoice,
  type AdStudioVoiceIssueCode,
  type AdStudioVideoSettings,
  type AdStudioSearchAd,
  type AdStudioSearchKeywords,
  type AdStudioSearchIssue,
  type AdStudioVideoSettingsIssueCode,
  type AdStudioAdCopyIssueCode,
  type AdStudioBriefInput,
  type AdStudioImageConcept,
  type AdStudioImageConceptIssue,
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
import { deleteAdStudioBriefMedia } from './ad-studio-video.service';
import { deleteAdStudioBriefImages } from './ad-studio-image.service';
import { deleteAdStudioBriefReferences, unknownSceneReferences } from './ad-studio-reference.service';
import { deleteAdStudioBriefRuns } from './ad-studio-run.service';

/** Limits a project starts with until an admin changes them. */
export const AD_STUDIO_DEFAULT_DAILY_TEXT_GENERATIONS = 50;
export const AD_STUDIO_DEFAULT_DAILY_VIDEO_SECONDS = 300;
export const AD_STUDIO_DEFAULT_DAILY_IMAGES = 40;
/** Upper bounds an admin can set, so a typo cannot open unlimited spend. */
export const AD_STUDIO_MAX_DAILY_TEXT_GENERATIONS = 1000;
export const AD_STUDIO_MAX_DAILY_VIDEO_SECONDS = 3600;
export const AD_STUDIO_MAX_DAILY_IMAGES = 500;
export const AD_STUDIO_DEFAULT_VIDEO_QA_RETRIES = 1;
export const AD_STUDIO_MAX_VIDEO_QA_RETRIES = 2;

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

export class AdStudioImageConceptsInvalidError extends Error {
  constructor(public readonly issues: AdStudioImageConceptIssue[]) {
    super(`The image concepts break ${issues.length} rule(s): ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'AdStudioImageConceptsInvalidError';
  }
}

export class AdStudioVoiceInvalidError extends Error {
  constructor(public readonly code: AdStudioVoiceIssueCode) {
    super(`The narrator voice is not valid: ${code}`);
    this.name = 'AdStudioVoiceInvalidError';
  }
}

export class AdStudioVideoSettingsInvalidError extends Error {
  constructor(public readonly code: AdStudioVideoSettingsIssueCode) {
    super(`The video settings are not valid: ${code}`);
    this.name = 'AdStudioVideoSettingsInvalidError';
  }
}

export class AdStudioSearchInvalidError extends Error {
  constructor(public readonly issues: AdStudioSearchIssue[]) {
    super(`The search ad breaks these rules: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'AdStudioSearchInvalidError';
  }
}

export class AdStudioCopyInvalidError extends Error {
  /** `target` is "video" or the image idea's id. */
  constructor(public readonly issues: { code: AdStudioAdCopyIssueCode | 'unknown_concept'; target: string }[]) {
    super(`The ad copy breaks ${issues.length} rule(s): ${issues.map((issue) => `${issue.code} (${issue.target})`).join(', ')}`);
    this.name = 'AdStudioCopyInvalidError';
  }
}

export class AdStudioQuotaExceededError extends Error {
  constructor(
    public readonly limitKind: 'text' | 'video' | 'image',
    public readonly used: number,
    public readonly limit: number,
  ) {
    super(`The project's daily Ad Studio ${limitKind === 'text' ? 'AI text' : limitKind === 'video' ? 'video seconds' : 'images'} limit is reached (${used} of ${limit}).`);
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
  if (input.narrationMode !== undefined && input.narrationMode !== null && !isAdStudioNarrationMode(input.narrationMode)) {
    reasons.push('narrationMode must be voiceover, on_camera, mixed or null (automatic)');
  }
  if (reasons.length) throw new AdStudioBriefInvalidError(reasons);
  return {
    name,
    objective,
    productDescription,
    landingPageUrl,
    format: input.format,
    language,
    targetSeconds: input.targetSeconds,
    ...(input.narrationMode !== undefined ? { narrationMode: input.narrationMode } : {}),
  };
}

/** The narration mode an ad's script follows now (see `resolveNarrationMode`). */
export function adStudioNarrationMode(brief: Pick<AdStudioBriefModel, 'narration_mode' | 'detected_narration_mode' | 'scenes'>): AdStudioNarrationMode {
  return resolveNarrationMode({ chosen: brief.narration_mode ?? null, detected: brief.detected_narration_mode ?? null, scenes: brief.scenes ?? [] });
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
    narrationMode: brief.narration_mode ?? null,
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
  brief.narration_mode = input.narrationMode ?? null;
  brief.detected_narration_mode = null;
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
  // A brief sent without a narration mode keeps the one it has; a new one is applied to the script.
  if (input.narrationMode !== undefined) {
    brief.narration_mode = input.narrationMode;
    brief.scenes = applyNarrationMode(brief.scenes ?? [], adStudioNarrationMode(brief));
  }
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Sets who narrates the ad (`null` for automatic) and applies it to the current script at once, so
 * every scene whose delivery or speaker changes shows its clip out of date (the scene fingerprint
 * includes both). `presenter`, for `on_camera`, names the one person who speaks in every scene;
 * absent keeps the first one the script names.
 */
export async function saveAdStudioNarrationMode(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  mode: AdStudioNarrationMode | null;
  presenter?: string | null;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  if (params.mode !== null && !isAdStudioNarrationMode(params.mode)) throw new AdStudioBriefInvalidError(['narrationMode must be voiceover, on_camera, mixed or null (automatic)']);
  if ((params.presenter ?? '').trim().length > AD_STUDIO_SPEAKER_MAX) throw new AdStudioBriefInvalidError([`presenter must be at most ${AD_STUDIO_SPEAKER_MAX} characters`]);
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  brief.narration_mode = params.mode;
  brief.scenes = applyNarrationMode(brief.scenes ?? [], adStudioNarrationMode(brief), params.presenter);
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
  /** The narration mode the script writer read from the brief (automatic mode); absent keeps the stored one. */
  detectedNarrationMode?: AdStudioNarrationMode | null;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const issues = validateAdStudioScenes(params.scenes);
  if (issues.length) throw new AdStudioScriptInvalidError(issues);
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  const unknown = await unknownSceneReferences(params.organizationId, params.projectId, params.briefId, params.scenes);
  if (unknown.length) throw new AdStudioScriptInvalidError(unknown);
  if (params.detectedNarrationMode !== undefined) brief.detected_narration_mode = isAdStudioNarrationMode(params.detectedNarrationMode) ? params.detectedNarrationMode : null;
  // Resolved against the stored script, so an ad from before modes keeps its on-screen scenes.
  const mode = adStudioNarrationMode(brief);
  // A pronunciation sent back unchanged for narration that changed belongs to the old words. It is
  // dropped here so every client (the editor, MCP, the generator) follows the same rule.
  // Who speaks is kept only with narration, and the voice-over default is stored as nothing; then
  // the ad's narration mode decides it (a voice-over ad never puts a speaker on screen).
  const scenes = reconcilePronunciations(brief.scenes ?? [], params.scenes).map(({ delivery: _delivery, speaker: _speaker, ...scene }) => ({
    ...scene,
    ...speakerFields({ voiceover: scene.voiceover, delivery: _delivery, speaker: _speaker }),
  }));
  brief.scenes = applyNarrationMode(scenes, mode);
  brief.script_generated_by = params.generatedBy ?? null;
  brief.status = 'scripted';
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Stores the brief's image ad ideas (written by a person or generated), replacing the earlier list.
 * Images already rendered stay attached to their concept id; a changed concept simply makes its
 * images stale (see `imageConceptFingerprint`), so nothing is deleted by an edit.
 */
export async function saveAdStudioImageConcepts(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  concepts: AdStudioImageConcept[];
  generatedBy?: AdStudioGeneratedBy | null;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const issues = validateAdStudioImageConcepts(params.concepts);
  if (issues.length) throw new AdStudioImageConceptsInvalidError(issues);
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  // An idea sent without copy keeps the copy it has (the ideas editor does not carry it); copy is
  // changed or cleared through saveAdStudioCopy (KAN-278).
  const storedCopy = new Map((brief.image_concepts ?? []).flatMap((concept) => (concept.copy ? [[concept.id, concept.copy] as const] : [])));
  // Likewise its look (style, layout, emphasis): an editor that does not send it keeps it; the emphasis
  // is fitted again to the headline as saved, so a reworded headline drops phrases no longer in it.
  const storedLook = new Map((brief.image_concepts ?? []).map((concept) => [concept.id, concept] as const));
  brief.image_concepts = params.concepts.map((concept) => {
    const { copy: sent, style, layout, emphasis, ...rest } = concept;
    const copy = sent ?? storedCopy.get(concept.id);
    const stored = storedLook.get(concept.id);
    const lookStyle = style ?? stored?.style;
    const lookLayout = layout ?? stored?.layout;
    const lookEmphasis = fitHeadlineEmphasis(concept.headline, emphasis ?? stored?.emphasis);
    return {
      ...rest,
      formats: [...concept.formats],
      ...(lookStyle ? { style: lookStyle } : {}),
      ...(lookLayout ? { layout: lookLayout } : {}),
      ...(lookStyle ? { emphasis: lookEmphasis } : {}),
      ...(copy && !isAdCopyEmpty(copy) ? { copy: { ...copy } } : {}),
    };
  });
  brief.image_concepts_generated_by = params.generatedBy ?? null;
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Sets the ad's narrator voice - the same voice in every scene - or clears it (null: the video model
 * chooses). A changed voice makes the clips of scenes with narration out of date.
 */
export async function saveAdStudioVoice(params: { organizationId: string; projectId: string; briefId: string; voice: AdStudioVoice | null; now?: Date }): Promise<AdStudioBriefModel> {
  const issue = params.voice ? voiceIssue(params.voice) : null;
  if (issue) throw new AdStudioVoiceInvalidError(issue);
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  brief.narrator_voice = params.voice
    ? params.voice.preset === 'custom'
      ? { preset: 'custom', description: (params.voice.description ?? '').replace(/\s+/g, ' ').trim() }
      : { preset: params.voice.preset }
    : null;
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Changes the ad's advanced video settings. Fields left out keep their saved value; settings back at
 * the defaults are stored as null. A change makes every clip made with the old settings out of date.
 */
export async function saveAdStudioVideoSettings(params: { organizationId: string; projectId: string; briefId: string; settings: Partial<AdStudioVideoSettings>; now?: Date }): Promise<AdStudioBriefModel> {
  const issue = videoSettingsIssue(params.settings);
  if (issue) throw new AdStudioVideoSettingsInvalidError(issue);
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  const next = normalizeVideoSettings({ ...normalizeVideoSettings(brief.video_settings), ...params.settings });
  brief.video_settings = isDefaultVideoSettings(next) ? null : next;
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/** Saves the keywords the ad's search ad bids on and the negatives, or clears them with null. */
export async function saveAdStudioSearchKeywords(params: { organizationId: string; projectId: string; briefId: string; keywords: AdStudioSearchKeywords | null; now?: Date }): Promise<AdStudioBriefModel> {
  const value = params.keywords ? normalizeSearchKeywords(params.keywords) : null;
  if (value) {
    const issues = searchKeywordsIssues(value);
    if (issues.length) throw new AdStudioSearchInvalidError(issues);
  }
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  brief.search_keywords = value;
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/** Saves the responsive search ad, or clears it with null. Refused with every broken rule. */
export async function saveAdStudioSearchAd(params: { organizationId: string; projectId: string; briefId: string; ad: AdStudioSearchAd | null; now?: Date }): Promise<AdStudioBriefModel> {
  const value = params.ad ? normalizeSearchAd(params.ad) : null;
  if (value) {
    const issues = searchAdIssues(value);
    if (issues.length) throw new AdStudioSearchInvalidError(issues);
  }
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  brief.search_ad = value;
  brief.last_changed_on = nowIso(params.now);
  await brief.save();
  return brief;
}

/**
 * Saves ad copy (KAN-278): the video's and/or some image ideas', by idea id. `null` clears a copy;
 * a target left out is untouched. Copy never changes how a creative renders, so nothing goes out of date.
 */
export async function saveAdStudioCopy(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  videoCopy?: AdStudioAdCopy | null;
  conceptCopies?: Record<string, AdStudioAdCopy | null>;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  const concepts = brief.image_concepts ?? [];
  const issues: { code: AdStudioAdCopyIssueCode | 'unknown_concept'; target: string }[] = [];
  if (params.videoCopy) issues.push(...adCopyIssues(params.videoCopy).map((code) => ({ code, target: 'video' })));
  for (const [conceptId, copy] of Object.entries(params.conceptCopies ?? {})) {
    if (!concepts.some((concept) => concept.id === conceptId)) issues.push({ code: 'unknown_concept', target: conceptId });
    issues.push(...adCopyIssues(copy).map((code) => ({ code, target: conceptId })));
  }
  if (issues.length) throw new AdStudioCopyInvalidError(issues);
  const clean = (copy: AdStudioAdCopy) => ({ headline: copy.headline.replace(/\s+/g, ' ').trim(), primaryText: copy.primaryText.replace(/\s+/g, ' ').trim(), description: copy.description.replace(/\s+/g, ' ').trim() });
  if (params.videoCopy !== undefined) brief.video_copy = params.videoCopy && !isAdCopyEmpty(params.videoCopy) ? clean(params.videoCopy) : null;
  if (params.conceptCopies) {
    brief.image_concepts = concepts.map((concept) => {
      if (!(concept.id in (params.conceptCopies as object))) return concept;
      const copy = (params.conceptCopies as Record<string, AdStudioAdCopy | null>)[concept.id];
      const { copy: _old, ...rest } = concept;
      return copy && !isAdCopyEmpty(copy) ? { ...rest, copy: clean(copy) } : rest;
    });
  }
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

export async function deleteAdStudioBrief(params: { organizationId: string; projectId: string; briefId: string; actorId: string; actorType?: 'user' | 'api_key' }): Promise<void> {
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  await brief.remove();
  // Its clips, assembled videos, images, reference images and autopilot runs go with it; the engine removes their stored files.
  await Promise.all([
    deleteAdStudioBriefMedia(params.organizationId, params.projectId, params.briefId),
    deleteAdStudioBriefImages(params.organizationId, params.projectId, params.briefId),
    deleteAdStudioBriefReferences(params.organizationId, params.projectId, params.briefId),
    deleteAdStudioBriefRuns(params.organizationId, params.projectId, params.briefId),
  ]);
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType ?? 'user',
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
  dailyImages: number;
  /** The AI quality check of rendered clips: on or off, and how many automatic re-renders a failing scene gets. */
  videoQa: { enabled: boolean; retries: number };
  /** The size images are rendered at: 2K meets Meta's recommended sizes, 1K is cheaper for drafts. */
  imageSize: AdStudioImageSize;
  /** Whether assembled video ads carry the brand banner (logo, name, slogan) along the bottom. */
  videoBrandBanner: boolean;
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
      dailyImages: AD_STUDIO_DEFAULT_DAILY_IMAGES,
      videoQa: { enabled: true, retries: AD_STUDIO_DEFAULT_VIDEO_QA_RETRIES },
      imageSize: DEFAULT_AD_STUDIO_IMAGE_SIZE,
      videoBrandBanner: true,
      customized: false,
      lastChangedOn: null,
    };
  }
  return {
    dailyTextGenerations: settings.daily_text_generations,
    dailyVideoSeconds: settings.daily_video_seconds,
    dailyImages: settings.daily_images ?? AD_STUDIO_DEFAULT_DAILY_IMAGES,
    videoQa: { enabled: settings.video_qa_enabled ?? true, retries: settings.video_qa_retries ?? AD_STUDIO_DEFAULT_VIDEO_QA_RETRIES },
    imageSize: isAdStudioImageSize(settings.image_size) ? settings.image_size : DEFAULT_AD_STUDIO_IMAGE_SIZE,
    videoBrandBanner: settings.video_brand_banner ?? true,
    customized: true,
    lastChangedOn: settings.last_changed_on,
  };
}

export async function setAdStudioSettings(params: {
  organizationId: string;
  projectId: string;
  dailyTextGenerations: number;
  dailyVideoSeconds: number;
  /** Omitted by callers that predate image ads: the current image limit is kept. */
  dailyImages?: number;
  /** Omitted by callers that predate the quality check: the current settings are kept. */
  videoQa?: { enabled: boolean; retries: number };
  /** Omitted by callers that predate image sizes: the current size is kept. */
  imageSize?: string;
  /** Omitted by callers that predate the video brand banner: the current choice is kept. */
  videoBrandBanner?: boolean;
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
  if (params.dailyImages !== undefined && (!Number.isInteger(params.dailyImages) || params.dailyImages < 0 || params.dailyImages > AD_STUDIO_MAX_DAILY_IMAGES)) {
    reasons.push(`dailyImages must be a whole number from 0 to ${AD_STUDIO_MAX_DAILY_IMAGES}`);
  }
  if (params.videoQa && (typeof params.videoQa.enabled !== 'boolean' || !Number.isInteger(params.videoQa.retries) || params.videoQa.retries < 0 || params.videoQa.retries > AD_STUDIO_MAX_VIDEO_QA_RETRIES)) {
    reasons.push(`videoQa.retries must be a whole number from 0 to ${AD_STUDIO_MAX_VIDEO_QA_RETRIES}`);
  }
  if (params.imageSize !== undefined && !isAdStudioImageSize(params.imageSize)) reasons.push('imageSize must be 1K or 2K');
  if (params.videoBrandBanner !== undefined && typeof params.videoBrandBanner !== 'boolean') reasons.push('videoBrandBanner must be true or false');
  if (reasons.length) throw new AdStudioBriefInvalidError(reasons);
  await requireProject(params.organizationId, params.projectId);

  const before = await getAdStudioSettings(params.organizationId, params.projectId);
  const dailyImages = params.dailyImages ?? before.dailyImages;
  const videoQa = params.videoQa ?? before.videoQa;
  const imageSize = isAdStudioImageSize(params.imageSize) ? params.imageSize : before.imageSize;
  const videoBrandBanner = params.videoBrandBanner ?? before.videoBrandBanner;
  const existing = await AdStudioSettingsModel.init(SETTINGS_ID, { organization_id: params.organizationId, project_id: params.projectId });
  const settings = existing ?? new AdStudioSettingsModel();
  settings.organization_id = params.organizationId;
  settings.project_id = params.projectId;
  settings.daily_text_generations = params.dailyTextGenerations;
  settings.daily_video_seconds = params.dailyVideoSeconds;
  settings.daily_images = dailyImages;
  settings.video_qa_enabled = videoQa.enabled;
  settings.video_qa_retries = videoQa.retries;
  settings.image_size = imageSize;
  settings.video_brand_banner = videoBrandBanner;
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
      summary: `Set Ad Studio daily limits to ${params.dailyTextGenerations} AI text calls, ${params.dailyVideoSeconds}s of video and ${dailyImages} images`,
      before: { daily_text_generations: before.dailyTextGenerations, daily_video_seconds: before.dailyVideoSeconds, daily_images: before.dailyImages, video_qa: before.videoQa, image_size: before.imageSize, video_brand_banner: before.videoBrandBanner },
      after: { daily_text_generations: params.dailyTextGenerations, daily_video_seconds: params.dailyVideoSeconds, daily_images: dailyImages, video_qa: videoQa, image_size: imageSize, video_brand_banner: videoBrandBanner },
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
/** An AI illustration for a scene counts toward the image limit like any other image. */
const IMAGE_KINDS: ReadonlySet<AdStudioUsageKind> = new Set(['image', 'image_edit', 'reference_image']);

export interface AdStudioUsageToday {
  day: string;
  textGenerations: number;
  videoSeconds: number;
  images: number;
}

export async function getAdStudioUsageToday(organizationId: string, projectId: string, now?: Date): Promise<AdStudioUsageToday> {
  const day = utcDay(now);
  const rows = await AdStudioUsageModel.initPath({ organization_id: organizationId, project_id: projectId }).where('day', '==', day).get();
  let textGenerations = 0;
  let videoSeconds = 0;
  let images = 0;
  for (const row of rows) {
    if (VIDEO_KINDS.has(row.kind)) videoSeconds += row.units;
    else if (IMAGE_KINDS.has(row.kind)) images += row.units;
    else textGenerations += row.units;
  }
  return { day, textGenerations, videoSeconds, images };
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
  } else if (IMAGE_KINDS.has(params.kind)) {
    if (usage.images + params.units > settings.dailyImages) throw new AdStudioQuotaExceededError('image', usage.images, settings.dailyImages);
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
