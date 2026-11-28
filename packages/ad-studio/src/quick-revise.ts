import { z } from 'zod/v4';
import {
  AD_STUDIO_MATCH_TYPES,
  AD_STUDIO_VIDEO_INSTRUCTIONS_MAX,
  DEFAULT_AD_STUDIO_NARRATION_MODE,
  buildScriptRevisePrompt,
  buildSearchAdRevisePrompt,
  defaultSearchTargeting,
  fitAdCopy,
  fitAdStudioScenes,
  isAdCopyEmpty,
  isAdStudioNarrationMode,
  planToScriptContext,
  sanitizeKeywordChoice,
  type AdStudioImageFormat,
  type AdStudioScene,
} from '@growthos/shared';
import {
  adStudioNarrationMode,
  getAdStudioBrief,
  newAdStudioSceneId,
  saveAdStudioCopy,
  saveAdStudioSearchAd,
  saveAdStudioSearchKeywords,
  saveAdStudioVideoSettings,
  type AdStudioBriefModel,
  type KmsProvider,
} from '@growthos/firebase-orm-models';
import { briefPromptInput } from './brand';
import { generateAdStudioImageConcepts, rewriteAdStudioImageConcept } from './image-pipeline';
import { AdStudioProviderError } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';
import { ensureOrm } from './runtime';
import { GeneratedScriptSchema, generateAdStudioScript, generatedDelivery } from './script-generation';
import { SearchAdSchema, repairAndFitSearchAd, suggestAdStudioKeywords } from './search';
import { saveAdStudioScriptWithPronunciation } from './vocalize';

const SearchAdReviseSchema = SearchAdSchema.extend({
  keywords: z.array(z.object({ text: z.string(), matchType: z.enum(AD_STUDIO_MATCH_TYPES) })).optional(),
  negatives: z.array(z.string()).optional(),
});

function sameSceneCore(existing: AdStudioScene, candidate: Omit<AdStudioScene, 'id'>): boolean {
  return (
    existing.durationSeconds === Math.round(candidate.durationSeconds) &&
    existing.visualPrompt.trim() === candidate.visualPrompt.trim() &&
    existing.voiceover.trim() === candidate.voiceover.trim() &&
    existing.onScreenText.trim() === candidate.onScreenText.trim() &&
    (existing.delivery ?? 'voiceover') === (candidate.delivery ?? 'voiceover') &&
    (existing.speaker?.trim() ?? '') === (candidate.speaker?.trim() ?? '')
  );
}

/**
 * Matches generated scenes back to existing scene IDs so unchanged scenes keep their exact ID
 * (and rendered video clips), while modified or added scenes get updated/new IDs.
 */
function reconcileRevisedScenes(
  existingScenes: readonly AdStudioScene[],
  generated: z.infer<typeof GeneratedScriptSchema>['scenes'],
): AdStudioScene[] {
  const remaining = [...existingScenes];
  const matchedIds = new Array<string | null>(generated.length).fill(null);
  const matchedRefs = new Array<AdStudioScene['references'] | undefined>(generated.length).fill(undefined);

  const candidates = generated.map((scene) => ({
    durationSeconds: scene.durationSeconds,
    visualPrompt: scene.visualPrompt,
    voiceover: scene.voiceover,
    onScreenText: scene.onScreenText,
    ...generatedDelivery(scene),
  }));

  // Pass 1: exact content matches keep both scene ID and references.
  candidates.forEach((candidate, index) => {
    const matchIndex = remaining.findIndex((existing) => sameSceneCore(existing, candidate));
    if (matchIndex >= 0) {
      const [found] = remaining.splice(matchIndex, 1);
      matchedIds[index] = found.id;
      matchedRefs[index] = found.references;
    }
  });

  // Pass 2: positional fallback for edited scenes at the same slot.
  const assembled: AdStudioScene[] = candidates.map((candidate, index) => {
    let id = matchedIds[index];
    if (!id) {
      const positional = existingScenes[index];
      const remIndex = positional ? remaining.findIndex((entry) => entry.id === positional.id) : -1;
      if (remIndex >= 0) {
        id = remaining.splice(remIndex, 1)[0].id;
      } else {
        id = newAdStudioSceneId();
      }
    }
    const refs = matchedRefs[index];
    return {
      id,
      ...candidate,
      ...(refs?.length ? { references: refs } : {}),
    };
  });

  return fitAdStudioScenes(assembled, newAdStudioSceneId);
}

/**
 * Revises a brief's video script from a natural-language instruction (or generates one with that
 * instruction persisted in video settings when the brief has no scenes yet).
 */
export async function reviseAdStudioScriptWithInstruction(
  ctx: AdStudioCallContext & { briefId: string; instruction: string },
): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const instruction = ctx.instruction.trim();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);

  if (brief.scenes.length === 0) {
    if (instruction) {
      const existing = brief.video_settings?.instructions?.trim();
      const combined = existing
        ? `${existing}. ${instruction}`.slice(0, AD_STUDIO_VIDEO_INSTRUCTIONS_MAX)
        : instruction.slice(0, AD_STUDIO_VIDEO_INSTRUCTIONS_MAX);
      await saveAdStudioVideoSettings({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        briefId: brief.id,
        settings: { instructions: combined },
        now: ctx.now,
      });
    }
    return generateAdStudioScript(ctx);
  }

  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : undefined;
  const mode = adStudioNarrationMode(brief);
  const prompt = buildScriptRevisePrompt({ ...(await briefPromptInput(brief)), narrationMode: mode }, brief.scenes, instruction, context);
  const generated = await meteredCall(ctx, 'script', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedScriptSchema }));
  const scenes = reconcileRevisedScenes(brief.scenes, generated.scenes);
  if (scenes.length === 0 || scenes.some((scene) => scene.visualPrompt.length === 0)) {
    throw new AdStudioProviderError('invalid_output', 'The model returned a scene without a visual description.');
  }

  const videoCopy = generated.copy ? fitAdCopy(generated.copy) : null;
  if (videoCopy && !isAdCopyEmpty(videoCopy)) {
    await saveAdStudioCopy({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, videoCopy, now: ctx.now });
  }

  return saveAdStudioScriptWithPronunciation({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    scenes,
    actorId: ctx.actorId,
    llm: ctx.llm,
    generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model, generated_at: (ctx.now ?? new Date()).toISOString() },
    detectedNarrationMode: brief.narration_mode ? undefined : isAdStudioNarrationMode(generated.narrationMode) ? generated.narrationMode : DEFAULT_AD_STUDIO_NARRATION_MODE,
    now: ctx.now,
  });
}

/**
 * Revises a brief's Google responsive search ad (and updates or initializes keywords) from a
 * natural-language instruction.
 */
export async function reviseAdStudioSearchAdWithInstruction(
  ctx: AdStudioCallContext & { briefId: string; instruction: string; kms?: KmsProvider | null; fetchImpl?: typeof fetch },
): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const currentKeywords = brief.search_keywords?.keywords ?? [];
  const prompt = buildSearchAdRevisePrompt(await briefPromptInput(brief), brief.search_ad ?? null, currentKeywords, ctx.instruction, context);
  const written = await meteredCall(ctx, 'search_ad', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: SearchAdReviseSchema }));
  const ad = await repairAndFitSearchAd(ctx, brief, written);
  let updated = await saveAdStudioSearchAd({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, ad, now: ctx.now });

  const chosen = written.keywords?.length ? sanitizeKeywordChoice({ keywords: written.keywords, negatives: written.negatives ?? [] }, null) : null;
  if (chosen && chosen.keywords.length > 0) {
    const targeting = brief.search_keywords?.targeting ?? defaultSearchTargeting(brief.language);
    updated = await saveAdStudioSearchKeywords({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      briefId: brief.id,
      keywords: { targeting, keywords: chosen.keywords, negatives: chosen.negatives },
      now: ctx.now,
    });
  } else if (currentKeywords.length === 0) {
    const targeting = brief.search_keywords?.targeting ?? defaultSearchTargeting(brief.language);
    const suggestion = await suggestAdStudioKeywords({
      ...ctx,
      briefId: brief.id,
      targeting,
      seeds: [...(context.keywordThemes ?? []), brief.name],
      url: brief.landing_page_url ?? null,
      kms: ctx.kms,
      fetchImpl: ctx.fetchImpl,
    });
    updated = await saveAdStudioSearchKeywords({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      briefId: brief.id,
      keywords: suggestion.keywords,
      now: ctx.now,
    });
  }

  return updated;
}

/**
 * Revises one image idea (`conceptId`), all existing image ideas, or creates initial image ideas
 * guided by the user's instruction.
 */
export async function reviseAdStudioImagesWithInstruction(
  ctx: AdStudioCallContext & { briefId: string; instruction: string; conceptId?: string | null; formats?: readonly AdStudioImageFormat[] },
): Promise<AdStudioBriefModel> {
  await ensureOrm();
  if (ctx.conceptId) {
    return rewriteAdStudioImageConcept({ ...ctx, briefId: ctx.briefId, conceptId: ctx.conceptId, instruction: ctx.instruction });
  }
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const concepts = brief.image_concepts ?? [];
  if (concepts.length === 0) {
    return generateAdStudioImageConcepts({ ...ctx, briefId: brief.id, formats: ctx.formats, instruction: ctx.instruction });
  }
  let latest = brief;
  for (const concept of concepts) {
    latest = await rewriteAdStudioImageConcept({ ...ctx, briefId: brief.id, conceptId: concept.id, instruction: ctx.instruction });
  }
  return latest;
}
