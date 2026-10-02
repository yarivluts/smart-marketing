/* eslint-disable @typescript-eslint/no-explicit-any -- same TypeScript-compiler-limit reason `mcp-tools.ts`'s own top-of-file comment documents: every tool callback's `args` param is `any`, narrowed/validated by hand inside each handler. */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  AD_STUDIO_IMAGE_EXPORT_DESTINATIONS,
  AD_STUDIO_VIDEO_EXPORT_DESTINATIONS,
  AdStudioBriefInvalidError,
  AdStudioBriefNotFoundError,
  AdStudioClipNotFoundError,
  AdStudioExportInvalidError,
  AdStudioExportUnavailableError,
  AdStudioImageConceptsInvalidError,
  AdStudioImageNotFoundError,
  AdStudioImageNotReadyError,
  AdStudioQuotaExceededError,
  AdStudioRunAlreadyActiveError,
  AdStudioRunNotAwaitingApprovalError,
  AdStudioRunNotFoundError,
  AdStudioRunOptionsInvalidError,
  AdStudioScriptInvalidError,
  AdStudioCopyInvalidError,
  AdStudioReferenceInvalidError,
  AdStudioReferenceNotFoundError,
  AdStudioVideoNotFoundError,
  approveAdStudioRunPlan,
  cancelAdStudioRun,
  createAdStudioBrief,
  deleteAdStudioBrief,
  exportAdStudioVideo,
  getAdStudioBrief,
  getAdStudioRun,
  getAdStudioSettings,
  getAdStudioUsageToday,
  getAdStudioVideo,
  getLatestAdStudioRun,
  listAdStudioBriefs,
  listAdStudioClips,
  listAdStudioExports,
  listAdStudioVideos,
  listEnvironmentsForProject,
  ProjectNotFoundError,
  resolveAdStudioExportDestinations,
  saveAdStudioCopy,
  saveAdStudioVoice,
  AdStudioVoiceInvalidError,
  saveAdStudioVideoSettings,
  AdStudioVideoSettingsInvalidError,
  saveAdStudioSearchKeywords,
  saveAdStudioMetaTargeting,
  AdStudioTargetingInvalidError,
  META_BREAKDOWNS,
  type MetaBreakdown,
  saveAdStudioSearchAd,
  AdStudioSearchInvalidError,
  saveAdStudioImageConcepts,
  setAdStudioSettings,
  updateAdStudioBriefDetails,
  type AdStudioBriefModel,
  type AdStudioExportModel,
  type AdStudioImageExportDestination,
  type YouTubePrivacyStatus,
} from '@growthos/firebase-orm-models';
import {
  AdStudioAssemblyError,
  AdStudioImageRequestError,
  AdStudioProviderError,
  AdStudioReferenceRequestError,
  AdStudioVideoRequestError,
  addUploadedReference,
  adStudioBriefMediaPrefix,
  drawReferenceIllustration,
  listBriefReferences,
  readBriefReference,
  removeBriefReference,
  writeAdStudioCopy,
  researchAdStudioKeywords,
  loadAdStudioMetaAudiences,
  searchAdStudioMetaInterests,
  estimateAdStudioMetaReach,
  loadAdStudioMetaPerformance,
  writeAdStudioSearchAd,
  toAdStudioReferenceView,
  type AdStudioReferenceView,
  adStudioImageSlots,
  advanceAdStudioAutopilot,
  advanceBriefVideo,
  assembleBriefVideo,
  currentAssembledVideo,
  describeAdStudioProviders,
  editAdStudioImage,
  exportBriefImage,
  generateAdStudioImageConcepts,
  generateAdStudioScript,
  getServerKmsProvider,
  listBriefImages,
  parseAutopilotOptions,
  parseBriefInput,
  parseImageConcepts,
  parseScenes,
  planAdStudioBrief,
  publishBriefAd,
  proposeAdStudioSceneRewrite,
  readAdStudioObject,
  readBriefImage,
  renderAdStudioConceptImage,
  resolveAdStudioAutopilotDeps,
  resolveAdStudioImageDeps,
  resolveAdStudioImageGenerator,
  resolveAdStudioLlm,
  resolveAdStudioMediaStorage,
  resolveAdStudioVideoDeps,
  saveAdStudioScriptWithPronunciation,
  selectBriefImage,
  startAdStudioAutopilot,
  startRenderAll,
  startSceneEdit,
  startSceneRender,
  toAdStudioClipView,
  toAdStudioRunView,
  toAdStudioVideoView,
  type AdStudioClipView,
  type AdStudioRunView,
} from '@growthos/ad-studio';
import { assemblyPlan, isAdStudioImageFormat, sceneVideoStates, summarizeVideoProgress, voiceDescription, normalizeVideoSettings, type AdStudioAdCopy, type AdStudioVoice, type AdStudioVideoSettings, type AdStudioSearchKeyword, type AdStudioSearchKeywords, type AdStudioSearchAd, type AdStudioMetaTargeting, defaultMetaTargeting, metaTargetingIssues, normalizeMetaTargeting, isSearchTargeting, defaultSearchTargeting, type Permission } from '@growthos/shared';
import { auditedToolHandler, errorResult, textResult, toolInputSchema, type ToolResult } from './mcp-tools';
import { mcpCallerHasPermission } from './mcp-act-authorization';
import type { McpAuthContext } from './mcp-auth.guard';

/**
 * The AI Ad Studio over MCP: everything the Ad Studio page does, for an agent. Briefs, the deep plan,
 * AI scripts and scene rewrites, image ad ideas and images (render, change by instruction, pick a
 * version, read the image itself), per-scene video clips, the assembled video, the autopilot that
 * does all of it in one run, limits and usage, and exports to Meta, YouTube and Google Ads.
 *
 * Every tool runs the same engine the web app runs (`@growthos/ad-studio`) against the same
 * `@growthos/firebase-orm-models` records - no parallel path - so limits, audit entries and rules
 * are identical. Gates mirror the web routes: `ai.use` for the studio, `project.configure` for the
 * daily limits, `automation.execute` for sending anything to an ad platform (which, like
 * `propose_action`, only an OAuth connection's human can hold - never an API key).
 *
 * Long work is never one long call: rendering starts a job and `get_ad_video_status` /
 * `advance_ad_autopilot` move it on, so a client polls instead of holding a request open.
 */

function actorId(auth: McpAuthContext): string {
  return auth.userId ?? auth.apiKeyId ?? 'unknown-mcp-caller';
}

function actorType(auth: McpAuthContext): 'user' | 'api_key' {
  return auth.principalKind === 'api_key' ? 'api_key' : 'user';
}

function describeAdStudioToolError(error: unknown): string {
  if (
    error instanceof ProjectNotFoundError ||
    error instanceof AdStudioBriefNotFoundError ||
    error instanceof AdStudioClipNotFoundError ||
    error instanceof AdStudioVideoNotFoundError ||
    error instanceof AdStudioImageNotFoundError ||
    error instanceof AdStudioRunNotFoundError ||
    error instanceof AdStudioReferenceNotFoundError
  ) {
    return 'Not found.';
  }
  if (error instanceof AdStudioQuotaExceededError) {
    const what = error.limitKind === 'text' ? 'AI text calls' : error.limitKind === 'video' ? 'seconds of video' : 'images';
    return `The project's daily Ad Studio limit for ${what} is reached (${error.used} of ${error.limit}). An admin can raise it with set_ad_studio_limits.`;
  }
  if (error instanceof AdStudioProviderError) return `The AI provider failed (${error.code}): ${error.message}`;
  if (error instanceof AdStudioBriefInvalidError || error instanceof AdStudioRunOptionsInvalidError || error instanceof AdStudioExportInvalidError) {
    return `Invalid: ${error.reasons.join('; ')}`;
  }
  if (error instanceof AdStudioScriptInvalidError) return `The script breaks these rules: ${error.issues.map((issue) => (issue.scene ? `${issue.code} (scene ${issue.scene})` : issue.code)).join(', ')}.`;
  if (error instanceof AdStudioVoiceInvalidError) return `Invalid voice: ${error.code}.`;
  if (error instanceof AdStudioVideoSettingsInvalidError) return `Invalid video settings: ${error.code}.`;
  if (error instanceof AdStudioTargetingInvalidError) return `The audience breaks these rules: ${error.issues.join(', ')}.`;
  if (error instanceof AdStudioSearchInvalidError) return `The search ad breaks these rules: ${error.issues.map((issue) => (issue.index ? `${issue.code} (#${issue.index})` : issue.code)).join(', ')}.`;
  if (error instanceof AdStudioCopyInvalidError) return `The ad copy breaks these rules: ${error.issues.map((issue) => `${issue.code} (${issue.target})`).join(', ')}.`;
  if (error instanceof AdStudioImageConceptsInvalidError) {
    return `The image ideas break these rules: ${error.issues.map((issue) => (issue.concept ? `${issue.code} (idea ${issue.concept})` : issue.code)).join(', ')}.`;
  }
  if (error instanceof AdStudioImageRequestError || error instanceof AdStudioVideoRequestError) return `Cannot do that: ${error.code}.`;
  if (error instanceof AdStudioImageNotReadyError) return 'Cannot do that: image_not_ready.';
  if (error instanceof AdStudioReferenceRequestError || error instanceof AdStudioReferenceInvalidError) return `Cannot do that: ${error.code}.`;
  if (error instanceof AdStudioAssemblyError) return `Assembly failed: ${error.code}.`;
  if (error instanceof AdStudioRunNotAwaitingApprovalError) return 'Cannot do that: this run is not waiting for its plan to be confirmed.';
  if (error instanceof AdStudioRunAlreadyActiveError) return `An autopilot run is already in progress for this ad (run_id ${error.runId}); advance or cancel it first.`;
  if (error instanceof AdStudioExportUnavailableError) return `Exporting to ${error.destination} is not available for this project (${error.reason}); attach a credential with write access in project resources.`;
  throw error;
}

async function runAdStudioTool<Args>(auth: McpAuthContext, permission: Permission, args: unknown, handler: (args: Args) => Promise<ToolResult>): Promise<ToolResult> {
  if (!(await mcpCallerHasPermission(auth, permission))) {
    return errorResult(
      auth.principalKind === 'api_key'
        ? `This API key does not carry the "${permission}" scope required for this tool.`
        : `This MCP connection's user does not currently hold "${permission}" for this project.`,
    );
  }
  try {
    return await handler(args as Args);
  } catch (error) {
    return errorResult(describeAdStudioToolError(error));
  }
}

function webUrl(auth: McpAuthContext, briefId?: string): string | null {
  const base = process.env.GROWTHOS_WEB_APP_URL?.trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/en/orgs/${auth.organizationId}/projects/${auth.projectId}/ad-studio${briefId ? `?brief=${briefId}` : ''}`;
}

async function planEnvironment(auth: McpAuthContext): Promise<{ id: string; name: string } | null> {
  const environments = await listEnvironmentsForProject(auth.organizationId, auth.projectId);
  const chosen = (auth.environmentId ? environments.find((environment) => environment.id === auth.environmentId) : undefined) ?? environments.find((environment) => environment.name === 'prod') ?? environments[0];
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}

function exportOutput(row: AdStudioExportModel) {
  return {
    id: row.id,
    media_kind: row.media_kind ?? 'video',
    video_id: row.video_id ?? null,
    image_id: row.image_id ?? null,
    destination: row.destination,
    title: row.title,
    status: row.status,
    external_id: row.external_id ?? null,
    external_url: row.external_url ?? null,
    failure_code: row.failure_code ?? null,
    requested_on: row.requested_on,
  };
}

function runOutput(run: AdStudioRunView) {
  return {
    run_id: run.id,
    status: run.status,
    options: { plan: run.options.plan, images: run.options.images, image_formats: run.options.imageFormats, video: run.options.video, confirm_plan: run.options.confirmPlan },
    steps: run.steps.map((step) => ({ step: step.id, status: step.status, reason: step.reason, progress: step.progress })),
    failure_code: run.failureCode,
    started_on: run.startedOn,
    finished_on: run.finishedOn,
    plan_approved_on: run.planApprovedOn,
    next:
      run.status === 'running'
        ? 'Call advance_ad_autopilot again with this run_id until status is no longer "running".'
        : run.status === 'awaiting_approval'
          ? 'The plan, script and image ideas are ready and nothing is rendered yet. Show them to the person (get_ad_brief), apply any changes they ask for, and only after they confirm call approve_ad_plan, then advance_ad_autopilot again.'
          : null,
  };
}

/** Ad copy in MCP's snake_case, or null when none is written (KAN-278). */
function copyOutput(copy: AdStudioAdCopy | null | undefined) {
  return copy ? { headline: copy.headline, primary_text: copy.primaryText, description: copy.description } : null;
}

function referenceOutput(reference: AdStudioReferenceView) {
  return {
    image_id: reference.id,
    source: reference.source,
    label: reference.label,
    description: reference.description,
    status: reference.status,
    prompt: reference.prompt,
    mime_type: reference.mimeType,
    failure_code: reference.failureCode,
  };
}

function clipQaOutput(qa: AdStudioClipView['qa']) {
  if (!qa) return null;
  return {
    status: qa.status,
    issues: qa.issues.map((issue) => ({ kind: issue.kind, severity: issue.severity, detail: issue.detail, at_seconds: issue.atSeconds })),
    transcript: qa.transcript,
  };
}

function briefSummary(brief: AdStudioBriefModel) {
  return {
    id: brief.id,
    name: brief.name,
    objective: brief.objective,
    product_description: brief.product_description,
    landing_page_url: brief.landing_page_url ?? null,
    format: brief.video_format,
    language: brief.language,
    target_seconds: brief.target_seconds,
    status: brief.status,
    scene_count: brief.scenes.length,
    total_seconds: brief.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    image_idea_count: (brief.image_concepts ?? []).length,
    has_plan: Boolean(brief.plan),
    last_changed_on: brief.last_changed_on,
  };
}

/** One complete, current snapshot of an ad: brief, plan, scenes and their video state, image ideas and images, the video, the autopilot and exports. */
async function describeBrief(auth: McpAuthContext, briefId: string) {
  const ctx = { organizationId: auth.organizationId, projectId: auth.projectId, briefId };
  const brief = await getAdStudioBrief(auth.organizationId, auth.projectId, briefId);
  const [images, clipModels, videoModels, exports, run] = await Promise.all([
    listBriefImages(ctx),
    listAdStudioClips(auth.organizationId, auth.projectId, briefId),
    listAdStudioVideos(auth.organizationId, auth.projectId, briefId),
    listAdStudioExports(auth.organizationId, auth.projectId, briefId),
    getLatestAdStudioRun(auth.organizationId, auth.projectId, briefId),
  ]);
  const clips = clipModels.map(toAdStudioClipView);
  const videos = videoModels.map(toAdStudioVideoView);
  const context = { format: brief.video_format, language: brief.language, voice: voiceDescription(brief.narrator_voice), settings: brief.video_settings ?? null };
  const states = sceneVideoStates(brief.scenes, clips, context);
  const progress = summarizeVideoProgress(states, brief.scenes);
  const plan = assemblyPlan(brief.scenes, clips, context);
  const assembled = currentAssembledVideo(videos, plan?.map((entry) => entry.clip.id) ?? null);
  const concepts = brief.image_concepts ?? [];
  const slots = adStudioImageSlots(concepts, images, brief.language);
  return {
    brief: briefSummary(brief),
    plan: brief.plan ?? null,
    scenes: brief.scenes.map((scene, index) => ({
      id: scene.id,
      duration_seconds: scene.durationSeconds,
      visual_prompt: scene.visualPrompt,
      voiceover: scene.voiceover,
      pronunciation: scene.pronunciation ?? null,
      delivery: scene.delivery ?? 'voiceover',
      speaker: scene.speaker ?? null,
      references: (scene.references ?? []).map((reference) => ({ image_id: reference.imageId, use: reference.use })),
      on_screen_text: scene.onScreenText,
      video_state: states[index]?.state ?? 'none',
      clip_id: states[index]?.usable?.id ?? null,
      // The AI quality check of the scene's current clip: null while it renders or waits for the check.
      qa: clipQaOutput(states[index]?.usable?.qa ?? null),
    })),
    image_ideas: concepts.map((concept) => ({
      id: concept.id,
      visual_prompt: concept.visualPrompt,
      headline: concept.headline,
      formats: concept.formats,
      copy: copyOutput(concept.copy),
      placements: slots
        .filter((slot) => slot.conceptId === concept.id)
        .map((slot) => ({
          format: slot.format,
          state: slot.generating ? 'generating' : slot.selected && slot.current ? 'ready' : slot.selected ? 'out_of_date' : slot.versions[0]?.status === 'failed' ? 'failed' : 'none',
          selected_image_id: slot.selected?.id ?? null,
          versions: slot.versions.map((image) => ({ image_id: image.id, version: image.version, kind: image.kind, status: image.status, instruction: image.instruction, failure_code: image.failureCode })),
        })),
    })),
    video: {
      narrator_voice: brief.narrator_voice ? { preset: brief.narrator_voice.preset, description: brief.narrator_voice.preset === 'custom' ? (brief.narrator_voice.description ?? '') : null } : null,
      settings: settingsOutput(brief.video_settings),
      copy: copyOutput(brief.video_copy),
      scenes: progress.scenes,
      rendered: progress.rendered,
      generating: progress.generating,
      failed: progress.failed,
      out_of_date: progress.outOfDate,
      can_assemble: progress.canAssemble,
      assembled_video: assembled.latest ? { video_id: assembled.latest.id, current: assembled.current, duration_seconds: assembled.latest.durationSeconds } : null,
    },
    search: searchOutput(brief.search_keywords, brief.search_ad),
    meta_targeting: brief.meta_targeting ? targetingOutput(brief.meta_targeting) : null,
    autopilot: run ? runOutput(toAdStudioRunView(run)) : null,
    exports: exports.map(exportOutput),
    web_url: webUrl(auth, briefId),
  };
}

/** The ad's advanced video settings in snake case, every field filled. */
function settingsOutput(settings: AdStudioVideoSettings | null | undefined) {
  const full = normalizeVideoSettings(settings);
  return { resolution: full.resolution, style: full.style, music: full.music, music_description: full.musicDescription ?? null, avoid: full.avoid ?? null };
}

/** The search ad's keywords and responsive search ad in snake case. */
function searchOutput(keywords: AdStudioSearchKeywords | null | undefined, ad: AdStudioSearchAd | null | undefined) {
  return {
    targeting: keywords?.targeting ?? null,
    keywords: (keywords?.keywords ?? []).map(keywordOutput),
    negative_keywords: keywords?.negatives ?? [],
    ad: ad ? { headlines: ad.headlines, descriptions: ad.descriptions, path1: ad.path1, path2: ad.path2 } : null,
  };
}

function keywordOutput(keyword: AdStudioSearchKeyword) {
  return {
    text: keyword.text,
    match_type: keyword.matchType,
    avg_monthly_searches: keyword.avgMonthlySearches,
    competition: keyword.competition,
    low_top_of_page_bid: keyword.lowTopOfPageBid,
    high_top_of_page_bid: keyword.highTopOfPageBid,
  };
}

/** Meta targeting in snake case. */
function targetingOutput(targeting: AdStudioMetaTargeting) {
  const ref = (item: { id: string; name: string; sizeLower: number | null; sizeUpper: number | null }) => ({ id: item.id, name: item.name, size_lower: item.sizeLower, size_upper: item.sizeUpper });
  return { countries: targeting.countries, age_min: targeting.ageMin, age_max: targeting.ageMax, genders: targeting.genders, custom_audiences: targeting.customAudiences.map(ref), interests: targeting.interests.map(ref) };
}

/** Meta targeting from MCP arguments (snake case), over the saved one or the default. */
function targetingFromArgs(base: AdStudioMetaTargeting, a: any): AdStudioMetaTargeting {
  const refs = (list: any[] | undefined, current: AdStudioMetaTargeting['interests']) =>
    list ? list.map((item) => ({ id: String(item.id), name: String(item.name ?? ''), sizeLower: item.size_lower ?? null, sizeUpper: item.size_upper ?? null })) : current;
  return {
    countries: a.countries ?? base.countries,
    ageMin: a.age_min ?? base.ageMin,
    ageMax: a.age_max ?? base.ageMax,
    genders: a.genders ?? base.genders,
    customAudiences: refs(a.custom_audiences, base.customAudiences),
    interests: refs(a.interests, base.interests),
  };
}

const audienceRefShape = z.array(
  z.object({
    id: z.string().describe('The Meta id, from get_ad_audiences or search_ad_interests.'),
    name: z.string().describe('Its name.'),
    size_lower: z.number().nullable().optional().describe('Meta size range, low end.'),
    size_upper: z.number().nullable().optional().describe('Meta size range, high end.'),
  }),
);

const targetingFields = {
  countries: z.array(z.string()).optional().describe('ISO 2-letter country codes, 1-25.'),
  age_min: z.number().optional().describe('18-65.'),
  age_max: z.number().optional().describe('18-65; 65 means 65 and over.'),
  genders: z.array(z.string()).optional().describe('[] for everyone, or ["female"] / ["male"].'),
  custom_audiences: audienceRefShape.optional().describe('Custom or lookalike audiences of the ad account (at most 10); saved audiences cannot be used.'),
  interests: audienceRefShape.optional().describe('Meta interests (at most 25).'),
};

const targetingShape = z
  .object({
    country: z.string().describe('ALL, IL, US, GB, CA, AU, DE, FR, ES, IT, NL or IN.'),
    language: z.string().describe('he, en, ar, ru, es, fr, de or it.'),
  })
  .describe('Where volumes are looked up. Defaults from the ad language: Hebrew -> IL/he, otherwise ALL/en.');

const briefId = z.string().min(1).describe('The ad (brief) id, from list_ad_briefs or create_ad_brief.');

const briefFields = {
  name: z.string().describe('A short name for the ad.'),
  objective: z.string().describe('What the ad should achieve, in plain words (e.g. "trial signups from small law firms").'),
  product_description: z.string().describe('What is sold and to whom.'),
  landing_page_url: z.string().optional().describe('The page the ad sends people to (http/https). Used by the deep plan.'),
  format: z.string().describe('Video frame: "vertical" (9:16, Reels/Stories/Shorts) or "horizontal" (16:9, YouTube).'),
  language: z.string().describe('The ad language, e.g. "en" or "he" (voiceover, on-screen text, image headlines).'),
  target_seconds: z.number().describe('Wanted video length in seconds, at most 60.'),
};

const sceneShape = z
  .array(
    z.object({
      id: z.string().describe('The scene id; keep it for an existing scene, any new unique string for a new one.'),
      duration_seconds: z.number().describe('Whole seconds, 3 to 10.'),
      visual_prompt: z.string().describe('What the camera shows, in English.'),
      voiceover: z.string().describe('Narration in the ad language, or empty.'),
      pronunciation: z
        .string()
        .optional()
        .describe('How the narrator says the voiceover: for Hebrew, the same words with full nikud and numbers written out. Omit to have Hebrew narration vocalized on save; send back the stored one to keep it.'),
      delivery: z
        .string()
        .optional()
        .describe('Who says the narration: "voiceover" (default - an off-screen narrator, no one in the shot talks) or "on_screen" (a person in the shot says it, lip-synced).'),
      speaker: z
        .string()
        .optional()
        .describe('For "on_screen": which person in the shot speaks, when there are several (e.g. "the woman in the blue shirt"). Omit for whoever is in the shot.'),
      references: z
        .array(z.object({ image_id: z.string().describe('A ready image from list_ad_references.'), use: z.string().describe('"screen" (the real product screen, shown on any device), "subject" (show it as it looks) or "first_frame" (the shot starts on it).') }))
        .optional()
        .describe('Up to 3 reference images the video model gets with this scene. Omit or send [] for none.'),
      on_screen_text: z.string().describe('Text in the frame, in the ad language, or empty.'),
    }),
  )
  .describe('The whole script, in order: 3-10 seconds per scene, at most 60 seconds and 15 scenes in all.');

const ideaShape = z
  .array(
    z.object({
      id: z.string().describe('The idea id; keep it for an existing idea (its images stay attached), any new unique string for a new one.'),
      visual_prompt: z.string().describe('What the picture shows, in English, without text.'),
      headline: z.string().describe('The only text drawn into the image, in the ad language, at most 40 characters, or empty.'),
      formats: z.array(z.string()).describe('Placements: any of square (1:1), portrait (4:5), story (9:16), landscape (16:9).'),
    }),
  )
  .describe('All image ideas of the ad, at most 6. Replaces the current list.');

export function registerMcpAdStudioTools(server: McpServer, auth: McpAuthContext): void {
  const ctx = (id: string) => ({ organizationId: auth.organizationId, projectId: auth.projectId, briefId: id });

  server.registerTool(
    'list_ad_briefs',
    { title: 'List ads', description: 'Every ad (brief) in the Ad Studio of this project, newest first, with how far each has come. Requires "ai.use".', inputSchema: toolInputSchema({}) },
    auditedToolHandler(auth, 'list_ad_briefs', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async () => {
        const briefs = await listAdStudioBriefs(auth.organizationId, auth.projectId);
        return textResult({ ads: briefs.map(briefSummary), web_url: webUrl(auth) });
      }),
    ),
  );

  server.registerTool(
    'get_ad_brief',
    {
      title: 'Get an ad',
      description:
        'One ad in full: its brief, deep plan, scenes (with each scene\'s video state), image ideas with every placement\'s images and versions, the video\'s progress and assembled video, the latest autopilot run and exports. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'get_ad_brief', async (args: any) => runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => textResult(await describeBrief(auth, a.brief_id)))),
  );

  server.registerTool(
    'create_ad_brief',
    { title: 'Create an ad', description: 'Starts a new ad from a brief. Next: start_ad_autopilot to make everything, or plan/script/images step by step. Requires "ai.use".', inputSchema: toolInputSchema(briefFields) },
    auditedToolHandler(auth, 'create_ad_brief', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: Record<string, unknown>) => {
        const brief = await createAdStudioBrief({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          input: parseBriefInput({ ...a, productDescription: a.product_description, landingPageUrl: a.landing_page_url, targetSeconds: a.target_seconds }),
          createdByUserId: actorId(auth),
        });
        return textResult({ ad: briefSummary(brief), web_url: webUrl(auth, brief.id) });
      }),
    ),
  );

  server.registerTool(
    'update_ad_brief',
    { title: 'Update an ad brief', description: 'Changes an ad\'s brief (all fields are sent again). The script, ideas and media stay. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, ...briefFields }) },
    auditedToolHandler(auth, 'update_ad_brief', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: Record<string, unknown> & { brief_id: string }) => {
        const brief = await updateAdStudioBriefDetails({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          briefId: a.brief_id,
          input: parseBriefInput({ ...a, productDescription: a.product_description, landingPageUrl: a.landing_page_url, targetSeconds: a.target_seconds }),
        });
        return textResult({ ad: briefSummary(brief) });
      }),
    ),
  );

  server.registerTool(
    'delete_ad_brief',
    { title: 'Delete an ad', description: 'Deletes an ad with its script, image ideas, images, clips, videos and autopilot runs (exports stay in the history). Cannot be undone. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId }) },
    auditedToolHandler(auth, 'delete_ad_brief', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        await deleteAdStudioBrief({ organizationId: auth.organizationId, projectId: auth.projectId, briefId: a.brief_id, actorId: actorId(auth), actorType: actorType(auth) });
        await resolveAdStudioMediaStorage().deletePrefix(adStudioBriefMediaPrefix(ctx(a.brief_id)));
        return textResult({ deleted: a.brief_id });
      }),
    ),
  );

  server.registerTool(
    'plan_ad_brief',
    {
      title: 'Deep-plan an ad',
      description:
        'Runs the deep plan: reads the landing page, this project\'s real results and campaigns, and Google Ads search volumes, then recommends the ads to make next with its evidence. One AI text call. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'plan_ad_brief', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const llm = resolveAdStudioLlm();
        if (!llm) return errorResult('No AI text model is configured for this deployment.');
        const brief = await planAdStudioBrief({ ...ctx(a.brief_id), actorId: actorId(auth), llm, environment: await planEnvironment(auth) });
        return textResult({ plan: brief.plan ?? null, sources: brief.plan_sources ?? null });
      }),
    ),
  );

  server.registerTool(
    'generate_ad_script',
    { title: 'Write the video script', description: 'Writes the whole video script with AI (3-10 second scenes, at most 60 seconds), building on the plan, and saves it - replacing the current script. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId }) },
    auditedToolHandler(auth, 'generate_ad_script', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const llm = resolveAdStudioLlm();
        if (!llm) return errorResult('No AI text model is configured for this deployment.');
        await generateAdStudioScript({ ...ctx(a.brief_id), actorId: actorId(auth), llm });
        return textResult((await describeBrief(auth, a.brief_id)).scenes);
      }),
    ),
  );

  server.registerTool(
    'save_ad_script',
    { title: 'Save the video script', description: 'Saves an edited script. Scenes whose text changed show their clips as out of date until rendered again. Hebrew narration without a pronunciation is vocalized first (one AI text call, best effort); a pronunciation sent back unchanged for narration that changed is redone. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, scenes: sceneShape }) },
    auditedToolHandler(auth, 'save_ad_script', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; scenes: unknown }) => {
        const scenes = parseScenes(
          Array.isArray(a.scenes)
            ? a.scenes.map((scene: Record<string, unknown>) => ({ id: scene.id, durationSeconds: scene.duration_seconds, visualPrompt: scene.visual_prompt, voiceover: scene.voiceover, pronunciation: scene.pronunciation, delivery: scene.delivery, speaker: scene.speaker, references: Array.isArray(scene.references) ? scene.references.map((reference: Record<string, unknown>) => ({ imageId: reference.image_id, use: reference.use })) : undefined, onScreenText: scene.on_screen_text }))
            : null,
        );
        if (!scenes) return errorResult('Invalid: scenes must be an array.');
        await saveAdStudioScriptWithPronunciation({ ...ctx(a.brief_id), scenes, actorId: actorId(auth), llm: resolveAdStudioLlm() });
        return textResult((await describeBrief(auth, a.brief_id)).scenes);
      }),
    ),
  );

  server.registerTool(
    'rewrite_ad_scene',
    {
      title: 'Propose a scene rewrite',
      description: 'Asks the AI to rewrite one scene by an instruction and returns the proposal WITHOUT saving it; to keep it, send the script back with save_ad_script. One AI text call. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, scene_id: z.string().min(1).describe('The scene to rewrite.'), instruction: z.string().min(1).describe('What to change, e.g. "make it funnier".') }),
    },
    auditedToolHandler(auth, 'rewrite_ad_scene', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; scene_id: string; instruction: string }) => {
        const llm = resolveAdStudioLlm();
        if (!llm) return errorResult('No AI text model is configured for this deployment.');
        const scene = await proposeAdStudioSceneRewrite({ ...ctx(a.brief_id), actorId: actorId(auth), llm, sceneId: a.scene_id, instruction: a.instruction });
        return textResult({ proposal: { id: scene.id, duration_seconds: scene.durationSeconds, visual_prompt: scene.visualPrompt, voiceover: scene.voiceover, on_screen_text: scene.onScreenText }, saved: false });
      }),
    ),
  );

  server.registerTool(
    'generate_ad_image_ideas',
    {
      title: 'Write image ad ideas',
      description: 'Writes image ad ideas with AI from the brief, plan and video script, and saves them (replacing the current ideas). With image_formats every idea is rendered in those placements. One AI text call. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, image_formats: z.array(z.string()).optional().describe('Placements for every idea: square, portrait, story, landscape. Omit to let the AI choose per idea.') }),
    },
    auditedToolHandler(auth, 'generate_ad_image_ideas', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; image_formats?: unknown }) => {
        const llm = resolveAdStudioLlm();
        if (!llm) return errorResult('No AI text model is configured for this deployment.');
        const { imageFormats } = parseAutopilotOptions({ imageFormats: a.image_formats });
        await generateAdStudioImageConcepts({ ...ctx(a.brief_id), actorId: actorId(auth), llm, formats: imageFormats });
        return textResult((await describeBrief(auth, a.brief_id)).image_ideas);
      }),
    ),
  );

  server.registerTool(
    'save_ad_image_ideas',
    { title: 'Save image ad ideas', description: 'Saves edited image ideas. Images stay attached to their idea id; a changed idea makes its images out of date until rendered again. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, ideas: ideaShape }) },
    auditedToolHandler(auth, 'save_ad_image_ideas', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; ideas: unknown }) => {
        const concepts = parseImageConcepts(
          Array.isArray(a.ideas) ? a.ideas.map((idea: Record<string, unknown>) => ({ id: idea.id, visualPrompt: idea.visual_prompt, headline: idea.headline, formats: idea.formats })) : null,
        );
        if (!concepts) return errorResult('Invalid: ideas must be an array.');
        await saveAdStudioImageConcepts({ organizationId: auth.organizationId, projectId: auth.projectId, briefId: a.brief_id, concepts });
        return textResult((await describeBrief(auth, a.brief_id)).image_ideas);
      }),
    ),
  );

  const copyShape = z
    .object({
      headline: z.string().describe('At most 30 characters.'),
      primary_text: z.string().describe('At most 90 characters, shown above the media.'),
      description: z.string().describe('At most 90 characters, shown under the headline.'),
    })
    .nullable();

  server.registerTool(
    'set_ad_voice',
    {
      title: 'Set the narrator voice',
      description:
        'Sets the one narrator voice of every scene of the ad, so separately rendered scenes sound alike: preset woman_warm, woman_energetic, man_warm, man_deep or man_energetic, or "custom" with a description in English. preset "none" clears it. Scenes with narration render again with the new voice. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        preset: z.string().describe('woman_warm, woman_energetic, man_warm, man_deep, man_energetic, custom, or none.'),
        description: z.string().optional().describe('For "custom": the voice in words, e.g. "an older man with a slow, warm voice".'),
      }),
    },
    auditedToolHandler(auth, 'set_ad_voice', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; preset: string; description?: string }) => {
        const voice = a.preset === 'none' ? null : ({ preset: a.preset, description: a.description } as AdStudioVoice);
        await saveAdStudioVoice({ ...ctx(a.brief_id), voice });
        return textResult({ narrator_voice: (await describeBrief(auth, a.brief_id)).video.narrator_voice });
      }),
    ),
  );

  server.registerTool(
    'set_ad_video_settings',
    {
      title: 'Set the advanced video settings',
      description:
        'Changes the advanced video settings of the ad; fields left out keep their value. resolution: 360p, 720p (default) or 1080p - the assembled video follows (1080p, else 720p). style: commercial (default), cinematic, ugc_phone, studio_product, documentary, animation_3d or illustration_2d. music: auto (default), none, or custom with music_description. avoid: what must never appear, in words ("" clears it). Every clip made with the old settings becomes out of date. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        resolution: z.string().optional().describe('360p, 720p or 1080p.'),
        style: z.string().optional().describe('commercial, cinematic, ugc_phone, studio_product, documentary, animation_3d or illustration_2d.'),
        music: z.string().optional().describe('auto, none or custom.'),
        music_description: z.string().optional().describe('For custom music, in English: e.g. "upbeat acoustic guitar".'),
        avoid: z.string().optional().describe('What must never appear in the video, e.g. "animals, cars". "" clears it.'),
      }),
    },
    auditedToolHandler(auth, 'set_ad_video_settings', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; resolution?: string; style?: string; music?: string; music_description?: string; avoid?: string }) => {
        const settings = {
          ...(a.resolution !== undefined ? { resolution: a.resolution } : {}),
          ...(a.style !== undefined ? { style: a.style } : {}),
          ...(a.music !== undefined ? { music: a.music } : {}),
          ...(a.music_description !== undefined ? { musicDescription: a.music_description } : {}),
          ...(a.avoid !== undefined ? { avoid: a.avoid } : {}),
        } as Partial<AdStudioVideoSettings>;
        const brief = await saveAdStudioVideoSettings({ ...ctx(a.brief_id), settings });
        return textResult({ settings: settingsOutput(brief.video_settings) });
      }),
    ),
  );

  server.registerTool(
    'research_ad_keywords',
    {
      title: 'Research keywords for a search ad',
      description:
        "Looks up keyword ideas with Google's own monthly searches, competition and top-of-page bid range (account currency) for seed phrases and/or the landing page, in a country and language - busiest first, up to 100. Uses the project's attached Google Ads account; when there is none or Google refuses, says why (status unavailable + reason). Nothing is saved: choose keywords with save_ad_keywords. Requires \"ai.use\".",
      inputSchema: toolInputSchema({
        brief_id: briefId,
        seeds: z.array(z.string()).describe('Up to 10 seed phrases.'),
        use_landing_page: z.boolean().optional().describe("Also seed from the ad's landing page (default true when it has one)."),
        targeting: targetingShape.optional(),
      }),
    },
    auditedToolHandler(auth, 'research_ad_keywords', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; seeds: string[]; use_landing_page?: boolean; targeting?: { country: string; language: string } }) => {
        const brief = await getAdStudioBrief(auth.organizationId, auth.projectId, a.brief_id);
        const targeting = a.targeting ?? brief.search_keywords?.targeting ?? defaultSearchTargeting(brief.language);
        if (!isSearchTargeting(targeting)) return errorResult('Invalid targeting: use one of the listed countries and languages.');
        const research = await researchAdStudioKeywords({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          seeds: a.seeds,
          url: a.use_landing_page === false ? null : brief.landing_page_url,
          targeting,
        });
        if (research.status !== 'ok') return textResult(research);
        return textResult({
          status: 'ok',
          targeting: research.targeting,
          ideas: research.ideas.map((idea) => ({ keyword: idea.keyword, avg_monthly_searches: idea.avgMonthlySearches, competition: idea.competition, low_top_of_page_bid: idea.lowTopOfPageBid, high_top_of_page_bid: idea.highTopOfPageBid })),
        });
      }),
    ),
  );

  server.registerTool(
    'save_ad_keywords',
    {
      title: 'Save the keywords of the search ad',
      description:
        'Saves the keywords the search ad bids on (at most 50; match type BROAD, PHRASE or EXACT; pass the volumes from research_ad_keywords to keep them) and negative keywords (searches that must not show the ad), with the targeting they were researched in. clear: true removes them. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        targeting: targetingShape.optional(),
        keywords: z
          .array(
            z.object({
              text: z.string().describe('The keyword, as people search it.'),
              match_type: z.string().describe('BROAD, PHRASE or EXACT.'),
              avg_monthly_searches: z.number().nullable().optional().describe('Monthly searches from research_ad_keywords.'),
              competition: z.string().nullable().optional().describe('LOW, MEDIUM or HIGH.'),
              low_top_of_page_bid: z.number().nullable().optional().describe('Low top-of-page bid from research_ad_keywords.'),
              high_top_of_page_bid: z.number().nullable().optional().describe('High top-of-page bid from research_ad_keywords.'),
            }),
          )
          .optional()
          .describe('The keywords the search ad bids on, at most 50 - the whole list, replacing the saved one.'),
        negative_keywords: z.array(z.string()).optional().describe('Searches that must not show the ad, e.g. "free", "jobs".'),
        clear: z.boolean().optional().describe('Remove the saved keywords and negatives.'),
      }),
    },
    auditedToolHandler(auth, 'save_ad_keywords', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: any) => {
        if (a.clear === true) {
          await saveAdStudioSearchKeywords({ ...ctx(a.brief_id), keywords: null });
          return textResult(searchOutput(null, null));
        }
        const brief = await getAdStudioBrief(auth.organizationId, auth.projectId, a.brief_id);
        const keywords: AdStudioSearchKeywords = {
          targeting: a.targeting ?? brief.search_keywords?.targeting ?? defaultSearchTargeting(brief.language),
          keywords: (a.keywords ?? []).map((keyword: any) => ({
            text: keyword.text,
            matchType: keyword.match_type,
            avgMonthlySearches: keyword.avg_monthly_searches ?? null,
            competition: keyword.competition ?? null,
            lowTopOfPageBid: keyword.low_top_of_page_bid ?? null,
            highTopOfPageBid: keyword.high_top_of_page_bid ?? null,
          })),
          negatives: a.negative_keywords ?? [],
        };
        const saved = await saveAdStudioSearchKeywords({ ...ctx(a.brief_id), keywords });
        return textResult(searchOutput(saved.search_keywords, saved.search_ad));
      }),
    ),
  );

  server.registerTool(
    'write_search_ad',
    {
      title: 'Write the search ad with AI',
      description:
        'Writes the Google responsive search ad (15 headlines of at most 30 characters, 4 descriptions of at most 90, display paths) with AI from the brief, the plan and the saved keywords, fitted to the limits, and saves it - replacing the saved one. One text generation. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'write_search_ad', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const llm = resolveAdStudioLlm();
        if (!llm) return errorResult('No AI text model is configured for this deployment.');
        const brief = await writeAdStudioSearchAd({ ...ctx(a.brief_id), actorId: actorId(auth), llm });
        return textResult(searchOutput(brief.search_keywords, brief.search_ad).ad);
      }),
    ),
  );

  server.registerTool(
    'save_search_ad',
    {
      title: 'Save the search ad',
      description: 'Saves an edited responsive search ad: 3-15 unique headlines (30 characters), 2-4 descriptions (90), path1/path2 (15). Refused with every broken rule. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        headlines: z.array(z.string()).describe('3-15 unique headlines, each at most 30 characters.'),
        descriptions: z.array(z.string()).describe('2-4 descriptions, each at most 90 characters.'),
        path1: z.string().optional().describe('First display-URL path, at most 15 characters.'),
        path2: z.string().optional().describe('Second display-URL path (needs path1), at most 15 characters.'),
      }),
    },
    auditedToolHandler(auth, 'save_search_ad', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; headlines: string[]; descriptions: string[]; path1?: string; path2?: string }) => {
        const brief = await saveAdStudioSearchAd({ ...ctx(a.brief_id), ad: { headlines: a.headlines, descriptions: a.descriptions, path1: a.path1 ?? '', path2: a.path2 ?? '' } });
        return textResult(searchOutput(brief.search_keywords, brief.search_ad).ad);
      }),
    ),
  );

  server.registerTool(
    'get_ad_audiences',
    {
      title: "List the Meta ad account's audiences",
      description:
        "The project's Meta ad account audiences - custom, lookalike and saved - with Meta's size ranges. Read only. When no Meta account is connected or Meta refuses, says why (status unavailable + reason). Requires \"ai.use\".",
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'get_ad_audiences', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async () => {
        const result = await loadAdStudioMetaAudiences({ organizationId: auth.organizationId, projectId: auth.projectId });
        if (result.status !== 'ok') return textResult(result);
        return textResult({ status: 'ok', audiences: result.data.map((audience) => ({ id: audience.id, name: audience.name, kind: audience.kind, subtype: audience.subtype, size_lower: audience.sizeLower, size_upper: audience.sizeUpper })) });
      }),
    ),
  );

  server.registerTool(
    'search_ad_interests',
    {
      title: 'Search Meta interests',
      description: 'Meta interests matching a word, with audience size ranges, named in the ad language when Meta has it. Read only. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, query: z.string().describe('A word or two, e.g. "law".') }),
    },
    auditedToolHandler(auth, 'search_ad_interests', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; query: string }) => {
        const brief = await getAdStudioBrief(auth.organizationId, auth.projectId, a.brief_id);
        const result = await searchAdStudioMetaInterests({ organizationId: auth.organizationId, projectId: auth.projectId, query: a.query, language: brief.language });
        if (result.status !== 'ok') return textResult(result);
        return textResult({ status: 'ok', interests: result.data.map((interest) => ({ id: interest.id, name: interest.name, size_lower: interest.sizeLower, size_upper: interest.sizeUpper, path: interest.path })) });
      }),
    ),
  );

  server.registerTool(
    'estimate_ad_reach',
    {
      title: 'Estimate the reach of an audience',
      description: "Meta's estimate of how many people a month the ad's audience reaches: the saved targeting, with any fields given here changed (not saved). Read only. Requires \"ai.use\".",
      inputSchema: toolInputSchema({ brief_id: briefId, ...targetingFields }),
    },
    auditedToolHandler(auth, 'estimate_ad_reach', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: any) => {
        const brief = await getAdStudioBrief(auth.organizationId, auth.projectId, a.brief_id);
        const targeting = normalizeMetaTargeting(targetingFromArgs(brief.meta_targeting ?? defaultMetaTargeting(brief.language), a));
        const issues = metaTargetingIssues(targeting);
        if (issues.length) return errorResult(`The audience breaks these rules: ${issues.join(', ')}.`);
        const result = await estimateAdStudioMetaReach({ organizationId: auth.organizationId, projectId: auth.projectId, targeting });
        if (result.status !== 'ok') return textResult(result);
        return textResult({ status: 'ok', monthly_lower: result.data.monthlyLower, monthly_upper: result.data.monthlyUpper, ready: result.data.ready });
      }),
    ),
  );

  server.registerTool(
    'get_ad_performance_breakdown',
    {
      title: 'What worked before on Meta',
      description:
        "The Meta ad account's last 90 days (every campaign) by breakdown age_gender, placement or country: spend, impressions, clicks, link clicks and conversions per segment, biggest spend first, in the account currency. Read only. Requires \"ai.use\".",
      inputSchema: toolInputSchema({ brief_id: briefId, breakdown: z.string().describe('age_gender, placement or country.') }),
    },
    auditedToolHandler(auth, 'get_ad_performance_breakdown', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; breakdown: string }) => {
        if (!(a.breakdown in META_BREAKDOWNS)) return errorResult('Invalid: breakdown is age_gender, placement or country.');
        const result = await loadAdStudioMetaPerformance({ organizationId: auth.organizationId, projectId: auth.projectId, breakdown: a.breakdown as MetaBreakdown });
        if (result.status !== 'ok') return textResult(result);
        return textResult({
          status: 'ok',
          rows: result.data.slice(0, 50).map((row) => ({ segment: row.segment, spend: row.spend, impressions: row.impressions, clicks: row.clicks, link_clicks: row.linkClicks, conversions: row.conversions })),
        });
      }),
    ),
  );

  server.registerTool(
    'set_ad_targeting',
    {
      title: 'Set the Meta audience of the ad',
      description:
        'Saves who the Meta ad targets - fields given change the saved targeting (or the default: the ad language country, every adult); clear: true removes it. Publishing to Meta targets it. Refused with every broken rule. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, ...targetingFields, clear: z.boolean().optional().describe('Remove the saved targeting.') }),
    },
    auditedToolHandler(auth, 'set_ad_targeting', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: any) => {
        if (a.clear === true) {
          await saveAdStudioMetaTargeting({ ...ctx(a.brief_id), targeting: null });
          return textResult({ meta_targeting: null });
        }
        const brief = await getAdStudioBrief(auth.organizationId, auth.projectId, a.brief_id);
        const saved = await saveAdStudioMetaTargeting({ ...ctx(a.brief_id), targeting: targetingFromArgs(brief.meta_targeting ?? defaultMetaTargeting(brief.language), a) });
        return textResult({ meta_targeting: saved.meta_targeting ? targetingOutput(saved.meta_targeting) : null });
      }),
    ),
  );

  server.registerTool(
    'write_ad_copy',
    {
      title: 'Write the ad copy',
      description:
        'Writes the ad text that runs next to each creative in the feed (headline, primary text, description) with AI, in the ad language, in one call: by default for the video and every image idea that has none. rewrite: true writes it again; keys ("video" or idea ids) limits it to those. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        rewrite: z.boolean().optional().describe('Write the copy again even where some exists.'),
        keys: z.array(z.string()).optional().describe('Only these creatives: "video" and/or image idea ids.'),
      }),
    },
    auditedToolHandler(auth, 'write_ad_copy', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; rewrite?: boolean; keys?: string[] }) => {
        const llm = resolveAdStudioLlm();
        if (!llm) return errorResult('No AI text model is configured for this deployment.');
        await writeAdStudioCopy({ ...ctx(a.brief_id), actorId: actorId(auth), llm, rewrite: a.rewrite === true, ...(a.keys ? { keys: a.keys } : {}) });
        const state = await describeBrief(auth, a.brief_id);
        return textResult({ video: state.video.copy, image_ideas: state.image_ideas.map((idea) => ({ id: idea.id, copy: idea.copy })) });
      }),
    ),
  );

  server.registerTool(
    'save_ad_copy',
    {
      title: 'Save the ad copy',
      description: 'Saves edited ad copy: video_copy and/or image_copies keyed by idea id; null clears one, a creative left out is untouched. Copy never makes a creative out of date. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        video_copy: copyShape.optional().describe('The copy next to the video, or null to clear it.'),
        image_copies: z.record(z.string(), copyShape).optional().describe('Copy per image idea id, or null to clear one.'),
      }),
    },
    auditedToolHandler(auth, 'save_ad_copy', async (args: any) =>
      runAdStudioTool(
        auth,
        'ai.use',
        args,
        async (a: { brief_id: string; video_copy?: { headline: string; primary_text: string; description: string } | null; image_copies?: Record<string, { headline: string; primary_text: string; description: string } | null> }) => {
          const fromMcp = (copy: { headline: string; primary_text: string; description: string } | null): AdStudioAdCopy | null =>
            copy ? { headline: copy.headline, primaryText: copy.primary_text, description: copy.description } : null;
          if (a.video_copy === undefined && !a.image_copies) return errorResult('Invalid: send video_copy and/or image_copies.');
          await saveAdStudioCopy({
            ...ctx(a.brief_id),
            ...(a.video_copy !== undefined ? { videoCopy: fromMcp(a.video_copy) } : {}),
            ...(a.image_copies ? { conceptCopies: Object.fromEntries(Object.entries(a.image_copies).map(([id, copy]) => [id, fromMcp(copy)])) } : {}),
          });
          const state = await describeBrief(auth, a.brief_id);
          return textResult({ video: state.video.copy, image_ideas: state.image_ideas.map((idea) => ({ id: idea.id, copy: idea.copy })) });
        },
      ),
    ),
  );

  server.registerTool(
    'render_ad_image',
    {
      title: 'Render an image',
      description: 'Renders one image idea in one placement with Gemini\'s image model; the new version becomes the selected one. Takes a few seconds. Counts toward the daily image limit. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, idea_id: z.string().min(1).describe('The image idea id.'), format: z.string().describe('One of the idea\'s placements: square, portrait, story, landscape.') }),
    },
    auditedToolHandler(auth, 'render_ad_image', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; idea_id: string; format: string }) => {
        if (!isAdStudioImageFormat(a.format)) return errorResult('Invalid: format must be square, portrait, story or landscape.');
        const deps = resolveAdStudioImageDeps();
        if (!deps.images) return errorResult('No image model is configured for this deployment.');
        const image = await renderAdStudioConceptImage({ ...ctx(a.brief_id), actorId: actorId(auth), conceptId: a.idea_id, format: a.format }, deps);
        return textResult({ image_id: image.id, status: image.status, version: image.version, selected: image.selected, next: 'Read it with get_ad_image.' });
      }),
    ),
  );

  server.registerTool(
    'edit_ad_image',
    {
      title: 'Change an image',
      description: 'Changes a finished image by an instruction ("warmer light", "put the headline at the top"); the model sees the image itself. The result is a new, selected version. Counts toward the daily image limit. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, image_id: z.string().min(1).describe('A ready image id.'), instruction: z.string().min(1).describe('What should change, up to 500 characters.') }),
    },
    auditedToolHandler(auth, 'edit_ad_image', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; image_id: string; instruction: string }) => {
        const deps = resolveAdStudioImageDeps();
        if (!deps.images) return errorResult('No image model is configured for this deployment.');
        const image = await editAdStudioImage({ ...ctx(a.brief_id), actorId: actorId(auth), imageId: a.image_id, instruction: a.instruction }, deps);
        return textResult({ image_id: image.id, status: image.status, version: image.version, parent_image_id: image.parent_image_id ?? null, selected: image.selected });
      }),
    ),
  );

  server.registerTool(
    'select_ad_image',
    { title: 'Pick an image version', description: 'Makes a ready image the chosen version for its idea and placement. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, image_id: z.string().min(1).describe('A ready image id.') }) },
    auditedToolHandler(auth, 'select_ad_image', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; image_id: string }) => {
        const image = await selectBriefImage({ ...ctx(a.brief_id), imageId: a.image_id });
        return textResult({ image_id: image.id, selected: image.selected });
      }),
    ),
  );

  const referenceText = {
    label: z.string().min(1).describe('A short name for the image.'),
    description: z.string().optional().describe('What the image shows; it goes into the scene prompt (e.g. "the dashboard after a document was signed").'),
  };

  server.registerTool(
    'list_ad_references',
    {
      title: 'List reference images',
      description:
        'Lists the ad\'s reference images - app screenshots and AI illustrations that scenes hand to the video model so the clip shows the real product - and whether illustrations can be drawn. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'list_ad_references', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const references = await listBriefReferences(ctx(a.brief_id));
        return textResult({ references: references.map(referenceOutput), can_draw_illustrations: resolveAdStudioImageGenerator() !== null });
      }),
    ),
  );

  server.registerTool(
    'add_ad_reference',
    {
      title: 'Add a reference image',
      description:
        'Adds a reference image to the ad\'s library. source "upload": send a PNG or JPEG (up to 4 MB) as base64 in image_base64 - for example a sharp screenshot of the real app taken in a browser. source "illustration": draw one with the image model from prompt (counts toward the daily image limit). Attach it to scenes with save_ad_script (scene.references). Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        source: z.string().describe('"upload" or "illustration".'),
        ...referenceText,
        image_base64: z.string().optional().describe('For source "upload": the PNG or JPEG bytes, base64.'),
        prompt: z.string().optional().describe('For source "illustration": what it should show.'),
        aspect_ratio: z.string().optional().describe('For source "illustration": "16:9" (default), "9:16", "1:1" or "4:5".'),
      }),
    },
    auditedToolHandler(auth, 'add_ad_reference', async (args: any) =>
      runAdStudioTool(
        auth,
        'ai.use',
        args,
        async (a: { brief_id: string; source: string; label: string; description?: string; image_base64?: string; prompt?: string; aspect_ratio?: string }) => {
          const base = { ...ctx(a.brief_id), actorId: actorId(auth), label: a.label, description: a.description ?? '' };
          if (a.source === 'upload') {
            if (!a.image_base64) return errorResult('Invalid: image_base64 is required for source "upload".');
            const reference = await addUploadedReference({ ...base, bytes: Buffer.from(a.image_base64, 'base64') });
            return textResult(referenceOutput(toAdStudioReferenceView(reference)));
          }
          if (a.source === 'illustration') {
            if (!a.prompt?.trim()) return errorResult('Invalid: prompt is required for source "illustration".');
            const aspectRatio = (['16:9', '9:16', '1:1', '4:5'] as const).find((ratio) => ratio === a.aspect_ratio) ?? '16:9';
            const reference = await drawReferenceIllustration({ ...base, prompt: a.prompt, aspectRatio }, { images: resolveAdStudioImageGenerator() });
            return textResult(referenceOutput(toAdStudioReferenceView(reference)));
          }
          return errorResult('Invalid: source must be "upload" or "illustration".');
        },
      ),
    ),
  );

  server.registerTool(
    'get_ad_reference',
    { title: 'Get a reference image', description: 'Returns a ready reference image itself (as MCP image content) with its details. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, image_id: z.string().min(1).describe('A reference image id.') }) },
    auditedToolHandler(auth, 'get_ad_reference', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; image_id: string }) => {
        const { bytes, mimeType, reference } = await readBriefReference({ ...ctx(a.brief_id), referenceId: a.image_id });
        return {
          content: [
            { type: 'text', text: JSON.stringify(referenceOutput(toAdStudioReferenceView(reference)), null, 2) },
            { type: 'image', data: bytes.toString('base64'), mimeType },
          ],
        };
      }),
    ),
  );

  server.registerTool(
    'delete_ad_reference',
    { title: 'Delete a reference image', description: 'Deletes a reference image and removes it from every scene that used it. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, image_id: z.string().min(1).describe('A reference image id.') }) },
    auditedToolHandler(auth, 'delete_ad_reference', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; image_id: string }) => {
        await removeBriefReference({ ...ctx(a.brief_id), referenceId: a.image_id });
        return textResult({ deleted: a.image_id });
      }),
    ),
  );

  server.registerTool(
    'get_ad_image',
    { title: 'Get an image', description: 'Returns a generated image itself (as MCP image content) with its details, so it can be looked at. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, image_id: z.string().min(1).describe('A ready image id.') }) },
    auditedToolHandler(auth, 'get_ad_image', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; image_id: string }) => {
        const { bytes, mimeType, image } = await readBriefImage({ ...ctx(a.brief_id), imageId: a.image_id });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ image_id: image.id, idea_id: image.concept_id, format: image.image_format, version: image.version, kind: image.kind, selected: image.selected, instruction: image.instruction ?? null }, null, 2) },
            { type: 'image', data: bytes.toString('base64'), mimeType },
          ],
        };
      }),
    ),
  );

  server.registerTool(
    'render_ad_video',
    {
      title: 'Render the video scenes',
      description:
        'Starts rendering every scene that has no current clip with Gemini Omni (the whole batch is checked against the daily video-seconds limit first). Rendering takes minutes: poll get_ad_video_status. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'render_ad_video', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const deps = resolveAdStudioVideoDeps();
        if (!deps.omni) return errorResult('No video model is configured for this deployment.');
        const started = await startRenderAll({ ...ctx(a.brief_id), actorId: actorId(auth) }, { ...deps, omni: deps.omni });
        return textResult({ started_scene_ids: started.map((clip) => clip.scene_id), next: 'Poll get_ad_video_status until every scene is rendered, then assemble_ad_video.' });
      }),
    ),
  );

  server.registerTool(
    'render_ad_scene',
    {
      title: 'Render one scene',
      description: 'Starts rendering one scene\'s clip (again). Counts the scene\'s seconds toward the daily video limit. Poll get_ad_video_status. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, scene_id: z.string().min(1).describe('The scene to render.') }),
    },
    auditedToolHandler(auth, 'render_ad_scene', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; scene_id: string }) => {
        const deps = resolveAdStudioVideoDeps();
        if (!deps.omni) return errorResult('No video model is configured for this deployment.');
        const clip = await startSceneRender({ ...ctx(a.brief_id), actorId: actorId(auth), sceneId: a.scene_id }, { ...deps, omni: deps.omni });
        return textResult({ clip_id: clip.id, status: clip.status });
      }),
    ),
  );

  server.registerTool(
    'edit_ad_scene_clip',
    {
      title: 'Change a scene clip',
      description: 'Changes a finished scene clip by an instruction ("slower camera", "evening light"); the model continues from the clip. Poll get_ad_video_status. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, scene_id: z.string().min(1).describe('The scene whose current clip to change.'), instruction: z.string().min(1).describe('What should change.') }),
    },
    auditedToolHandler(auth, 'edit_ad_scene_clip', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; scene_id: string; instruction: string }) => {
        const deps = resolveAdStudioVideoDeps();
        if (!deps.omni) return errorResult('No video model is configured for this deployment.');
        const clip = await startSceneEdit({ ...ctx(a.brief_id), actorId: actorId(auth), sceneId: a.scene_id, instruction: a.instruction }, { ...deps, omni: deps.omni });
        return textResult({ clip_id: clip.id, status: clip.status });
      }),
    ),
  );

  server.registerTool(
    'get_ad_video_status',
    {
      title: 'Video status',
      description: 'Moves rendering clips along and returns each scene\'s video state and the assembled video. Call it every few seconds while scenes are generating. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'get_ad_video_status', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const deps = resolveAdStudioVideoDeps();
        if (deps.omni) await advanceBriefVideo(ctx(a.brief_id), { ...deps, omni: deps.omni });
        const state = await describeBrief(auth, a.brief_id);
        return textResult({ scenes: state.scenes.map((scene) => ({ id: scene.id, video_state: scene.video_state, clip_id: scene.clip_id, qa: scene.qa })), video: state.video });
      }),
    ),
  );

  server.registerTool(
    'assemble_ad_video',
    {
      title: 'Assemble the video',
      description: 'Joins the current clip of every scene into the finished video (ffmpeg). Every scene must have a current clip. Takes up to a minute. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId }),
    },
    auditedToolHandler(auth, 'assemble_ad_video', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string }) => {
        const video = await assembleBriefVideo({ ...ctx(a.brief_id), actorId: actorId(auth) }, resolveAdStudioVideoDeps());
        return textResult({ video_id: video.id, status: video.status, duration_seconds: video.duration_seconds ?? null, web_url: webUrl(auth, a.brief_id) });
      }),
    ),
  );

  server.registerTool(
    'start_ad_autopilot',
    {
      title: 'Create everything automatically',
      description:
        'Starts the autopilot for an ad: deep plan -> script -> image ideas -> (the person confirms the plan) -> images in each placement -> video clips -> assembled video. Each step does only what is missing, so anything that exists or was edited is kept and a new run redoes only stale parts. Then call advance_ad_autopilot repeatedly. Exporting is not part of it. Requires "ai.use".',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        plan: z.boolean().optional().describe('Run the deep plan first when the ad has none. Default true.'),
        images: z.boolean().optional().describe('Make image ads. Default true.'),
        image_formats: z.array(z.string()).optional().describe('Placements for image ideas the run writes: square, portrait, story, landscape. Default square and portrait.'),
        video: z.boolean().optional().describe('Make the video ad. Default true.'),
        confirm_plan: z
          .boolean()
          .optional()
          .describe('Stop after the plan, script and image ideas (status "awaiting_approval") so the person reviews and confirms them before anything is rendered. Default true; set false only when the person said to skip the review.'),
      }),
    },
    auditedToolHandler(auth, 'start_ad_autopilot', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; plan?: unknown; images?: unknown; image_formats?: unknown; video?: unknown; confirm_plan?: unknown }) => {
        const options = parseAutopilotOptions({ plan: a.plan, images: a.images, imageFormats: a.image_formats, video: a.video, confirmPlan: a.confirm_plan });
        const run = await startAdStudioAutopilot({ ...ctx(a.brief_id), actorId: actorId(auth), actorType: actorType(auth), options: { ...options, environmentId: auth.environmentId ?? null } });
        return textResult(runOutput(toAdStudioRunView(run)));
      }),
    ),
  );

  server.registerTool(
    'advance_ad_autopilot',
    {
      title: 'Advance the autopilot',
      description:
        'Does the next unit of an autopilot run (a plan, a script, one image, one check of the rendering clips, the assembly) and returns the run. Call it again until status is not "running"; while clips render, wait a few seconds between calls. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, run_id: z.string().min(1).describe('The run id from start_ad_autopilot.') }),
    },
    auditedToolHandler(auth, 'advance_ad_autopilot', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; run_id: string }) => {
        const deps = resolveAdStudioAutopilotDeps(resolveAdStudioVideoDeps(), resolveAdStudioImageDeps());
        const run = await advanceAdStudioAutopilot({ ...ctx(a.brief_id), runId: a.run_id, actorId: actorId(auth), actorType: actorType(auth) }, deps);
        return textResult(runOutput(toAdStudioRunView(run)));
      }),
    ),
  );

  server.registerTool(
    'get_ad_autopilot',
    {
      title: 'Autopilot status',
      description: 'An autopilot run\'s steps and status without advancing it (the latest run when run_id is omitted). Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, run_id: z.string().optional().describe('A run id; omit for the latest run.') }),
    },
    auditedToolHandler(auth, 'get_ad_autopilot', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; run_id?: string }) => {
        const run = a.run_id ? await getAdStudioRun(auth.organizationId, auth.projectId, a.brief_id, a.run_id) : await getLatestAdStudioRun(auth.organizationId, auth.projectId, a.brief_id);
        return textResult(run ? runOutput(toAdStudioRunView(run)) : { run_id: null });
      }),
    ),
  );

  server.registerTool(
    'approve_ad_plan',
    {
      title: 'Confirm the plan',
      description:
        'Confirms the plan of an autopilot run that is "awaiting_approval" - the plan, script and image ideas as they read now, with any edits - so it goes on to render the images and the video. Call it only after the person has seen the plan and said to go ahead. Audited. Requires "ai.use".',
      inputSchema: toolInputSchema({ brief_id: briefId, run_id: z.string().min(1).describe('The waiting run.') }),
    },
    auditedToolHandler(auth, 'approve_ad_plan', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; run_id: string }) => {
        const run = await approveAdStudioRunPlan({ ...ctx(a.brief_id), runId: a.run_id, actorId: actorId(auth), actorType: actorType(auth) });
        return textResult(runOutput(toAdStudioRunView(run)));
      }),
    ),
  );

  server.registerTool(
    'cancel_ad_autopilot',
    { title: 'Stop the autopilot', description: 'Stops a running autopilot run, or discards one waiting for its plan to be confirmed; the unit in flight finishes, nothing further starts. Requires "ai.use".', inputSchema: toolInputSchema({ brief_id: briefId, run_id: z.string().min(1).describe('The run to stop.') }) },
    auditedToolHandler(auth, 'cancel_ad_autopilot', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async (a: { brief_id: string; run_id: string }) => {
        const run = await cancelAdStudioRun({ ...ctx(a.brief_id), runId: a.run_id, actorId: actorId(auth), actorType: actorType(auth) });
        return textResult(runOutput(toAdStudioRunView(run)));
      }),
    ),
  );

  server.registerTool(
    'list_ad_export_destinations',
    {
      title: 'Export destinations',
      description: 'Where this project can send creatives - Meta (videos and images), YouTube (videos), Google Ads (images) - and, where it cannot, why (not_attached, read_only, no_secret). Requires "ai.use".',
      inputSchema: toolInputSchema({}),
    },
    auditedToolHandler(auth, 'list_ad_export_destinations', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async () => {
        const destinations = await resolveAdStudioExportDestinations(auth.organizationId, auth.projectId);
        return textResult({
          destinations: Object.fromEntries(
            Object.entries(destinations).map(([name, state]) => [name, state.available ? { available: true, credential_name: state.credentialName } : { available: false, reason: state.reason }]),
          ),
          videos_go_to: AD_STUDIO_VIDEO_EXPORT_DESTINATIONS,
          images_go_to: AD_STUDIO_IMAGE_EXPORT_DESTINATIONS,
        });
      }),
    ),
  );

  server.registerTool(
    'export_ad_video',
    {
      title: 'Export the video',
      description:
        'Uploads an assembled video to the Meta ad account\'s video library or the YouTube channel. An outward change on an ad platform: requires "automation.execute", which only an OAuth connection\'s human can hold (never an API key).',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        video_id: z.string().min(1).describe('A ready assembled video id (get_ad_brief -> video.assembled_video).'),
        destination: z.string().describe('"meta" or "youtube".'),
        title: z.string().describe('1-100 characters.'),
        description: z.string().optional().describe('Up to 5000 characters.'),
        privacy: z.string().optional().describe('YouTube only: private, unlisted (default) or public.'),
      }),
    },
    auditedToolHandler(auth, 'export_ad_video', async (args: any) =>
      runAdStudioTool(auth, 'automation.execute', args, async (a: { brief_id: string; video_id: string; destination: string; title: string; description?: string; privacy?: string }) => {
        if (a.destination !== 'meta' && a.destination !== 'youtube') return errorResult('Invalid: videos export to meta or youtube.');
        const video = await getAdStudioVideo(auth.organizationId, auth.projectId, a.brief_id, a.video_id);
        const objectPath = video.gcs_path;
        if (video.status !== 'ready' || !objectPath) return errorResult('Cannot do that: the video is not assembled yet.');
        const storage = resolveAdStudioMediaStorage();
        const row = await exportAdStudioVideo({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          briefId: a.brief_id,
          videoId: a.video_id,
          destination: a.destination,
          title: a.title ?? '',
          description: a.description ?? '',
          ...(a.privacy ? { privacy: a.privacy as YouTubePrivacyStatus } : {}),
          readVideo: async () => new Uint8Array(await readAdStudioObject(storage, objectPath, 200 * 1024 * 1024)),
          kms: getServerKmsProvider(),
          actorId: actorId(auth),
          actorType: actorType(auth),
        });
        return row.status === 'done' ? textResult(exportOutput(row)) : errorResult(`The upload failed (${row.failure_code}).`);
      }),
    ),
  );

  server.registerTool(
    'export_ad_image',
    {
      title: 'Export an image',
      description:
        'Uploads a ready image to the Meta ad account\'s image library (returns the image hash) or as a Google Ads image asset (returns the asset resource name). Requires "automation.execute" (OAuth connections only).',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        image_id: z.string().min(1).describe('A ready image id.'),
        destination: z.string().describe('"meta" or "google_ads".'),
        title: z.string().describe('The asset name on the platform, 1-100 characters.'),
      }),
    },
    auditedToolHandler(auth, 'export_ad_image', async (args: any) =>
      runAdStudioTool(auth, 'automation.execute', args, async (a: { brief_id: string; image_id: string; destination: string; title: string }) => {
        if (!(AD_STUDIO_IMAGE_EXPORT_DESTINATIONS as readonly string[]).includes(a.destination)) return errorResult('Invalid: images export to meta or google_ads.');
        const row = await exportBriefImage({
          ...ctx(a.brief_id),
          imageId: a.image_id,
          destination: a.destination as AdStudioImageExportDestination,
          title: a.title ?? '',
          actorId: actorId(auth),
          actorType: actorType(auth),
        });
        return row.status === 'done' ? textResult(exportOutput(row)) : errorResult(`The upload failed (${row.failure_code}).`);
      }),
    ),
  );

  server.registerTool(
    'publish_ad',
    {
      title: 'Publish as a real ad',
      description:
        'Creates a real ad from a finished creative: on Meta a campaign, ad set, creative and ad (an image or the assembled video); on Google Ads a Display campaign, ad group and responsive display ad (images only; the image is cropped to 1.91:1 and square), or with search: true a Search campaign (Google Search only) from the saved search ad and keywords, in the country and language they were researched in. Everything is created PAUSED - nothing spends until the person turns it on in the platform - and the result carries the link to the ad. Requires "automation.execute" (OAuth connections only).',
      inputSchema: toolInputSchema({
        brief_id: briefId,
        destination: z.string().describe('"meta" or "google_ads".'),
        image_id: z.string().optional().describe('A ready image id; give this or video_id.'),
        video_id: z.string().optional().describe('A ready assembled video id (Meta only).'),
        search: z.boolean().optional().describe('Publish the saved search ad (google_ads only) instead of an image or video; headline and primary_text are then ignored.'),
        campaign_name: z.string().describe('1-120 characters.'),
        headline: z.string().optional().describe('Meta up to 40, Google up to 30 characters. Not used for search.'),
        primary_text: z.string().optional().describe('The main ad text (Google: the long headline, up to 90). Not used for search.'),
        description: z.string().optional().describe('Up to 90 characters.'),
        link_url: z.string().describe('The landing page, https.'),
        business_name: z.string().optional().describe('Google only, up to 25 characters.'),
        daily_budget: z.number().describe('Daily budget in the ad account currency.'),
        countries: z.array(z.string()).optional().describe('Meta targeting, ISO country codes.'),
        contains_eu_political_advertising: z.boolean().optional().describe('Google only and required there: ask the person, never assume.'),
      }),
    },
    auditedToolHandler(auth, 'publish_ad', async (args: any) =>
      runAdStudioTool(
        auth,
        'automation.execute',
        args,
        async (a: {
          brief_id: string;
          destination: string;
          image_id?: string;
          video_id?: string;
          search?: boolean;
          campaign_name: string;
          headline?: string;
          primary_text?: string;
          description?: string;
          link_url: string;
          business_name?: string;
          daily_budget: number;
          countries?: string[];
          contains_eu_political_advertising?: boolean;
        }) => {
          if (a.destination !== 'meta' && a.destination !== 'google_ads') return errorResult('Invalid: ads publish to meta or google_ads.');
          if ([Boolean(a.image_id), Boolean(a.video_id), a.search === true].filter(Boolean).length !== 1) return errorResult('Invalid: give exactly one of image_id, video_id or search: true.');
          const row = await publishBriefAd({
            ...ctx(a.brief_id),
            destination: a.destination,
            source: a.search ? { kind: 'search' } : a.image_id ? { kind: 'image', imageId: a.image_id } : { kind: 'video', videoId: a.video_id as string },
            copy: { headline: a.headline ?? '', primaryText: a.primary_text ?? '', description: a.description ?? '', linkUrl: a.link_url ?? '', businessName: a.business_name ?? '' },
            campaignName: a.campaign_name ?? '',
            dailyBudget: a.daily_budget,
            countries: a.countries ?? [],
            ...(a.contains_eu_political_advertising !== undefined ? { containsEuPoliticalAdvertising: a.contains_eu_political_advertising } : {}),
            actorId: actorId(auth),
            actorType: actorType(auth),
          });
          return row.status === 'done' ? textResult({ ...exportOutput(row), paused: true }) : errorResult(`Creating the ad failed (${row.failure_code}).`);
        },
      ),
    ),
  );

  server.registerTool(
    'get_ad_studio_usage',
    { title: 'Ad Studio limits and usage', description: 'The project\'s daily Ad Studio limits, today\'s usage, and which AI models this deployment has. Requires "ai.use".', inputSchema: toolInputSchema({}) },
    auditedToolHandler(auth, 'get_ad_studio_usage', async (args: any) =>
      runAdStudioTool(auth, 'ai.use', args, async () => {
        const [settings, usage] = await Promise.all([getAdStudioSettings(auth.organizationId, auth.projectId), getAdStudioUsageToday(auth.organizationId, auth.projectId)]);
        const providers = describeAdStudioProviders();
        return textResult({
          limits: { daily_text_generations: settings.dailyTextGenerations, daily_video_seconds: settings.dailyVideoSeconds, daily_images: settings.dailyImages },
          video_qa: { enabled: settings.videoQa.enabled, retries: settings.videoQa.retries },
          today: { day: usage.day, text_generations: usage.textGenerations, video_seconds: usage.videoSeconds, images: usage.images },
          models: { text: providers.text, video: providers.videoConfigured, images: resolveAdStudioImageGenerator() !== null },
        });
      }),
    ),
  );

  server.registerTool(
    'set_ad_studio_limits',
    {
      title: 'Set Ad Studio limits',
      description: 'Sets the project\'s daily Ad Studio limits (bounded so a typo cannot open unlimited spend). Audited. Requires "project.configure".',
      inputSchema: toolInputSchema({
        daily_text_generations: z.number().describe('AI text calls per day, 0-1000.'),
        daily_video_seconds: z.number().describe('Seconds of generated video per day, 0-3600.'),
        daily_images: z.number().optional().describe('Images (renders and edits) per day, 0-500. Omit to keep the current one.'),
        video_qa_enabled: z.boolean().optional().describe('Whether every rendered clip gets the AI quality check. Omit to keep the current setting.'),
        video_qa_retries: z.number().optional().describe('Automatic re-renders per scene whose clip fails the check, 0-2. Omit to keep the current one.'),
      }),
    },
    auditedToolHandler(auth, 'set_ad_studio_limits', async (args: any) =>
      runAdStudioTool(auth, 'project.configure', args, async (a: { daily_text_generations: number; daily_video_seconds: number; daily_images?: number; video_qa_enabled?: boolean; video_qa_retries?: number }) => {
        const current = await getAdStudioSettings(auth.organizationId, auth.projectId);
        const videoQa =
          a.video_qa_enabled !== undefined || a.video_qa_retries !== undefined
            ? { enabled: a.video_qa_enabled ?? current.videoQa.enabled, retries: a.video_qa_retries ?? current.videoQa.retries }
            : undefined;
        const settings = await setAdStudioSettings({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          dailyTextGenerations: a.daily_text_generations,
          dailyVideoSeconds: a.daily_video_seconds,
          ...(a.daily_images !== undefined ? { dailyImages: a.daily_images } : {}),
          ...(videoQa ? { videoQa } : {}),
          actorId: actorId(auth),
        });
        return textResult({
          daily_text_generations: settings.dailyTextGenerations,
          daily_video_seconds: settings.dailyVideoSeconds,
          daily_images: settings.dailyImages,
          video_qa: { enabled: settings.videoQa.enabled, retries: settings.videoQa.retries },
        });
      }),
    ),
  );
}

