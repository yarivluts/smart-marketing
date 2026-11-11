import { z } from 'zod/v4';
import {
  buildVocalizeCheckPrompt,
  buildVocalizePrompt,
  chooseVerifiedPronunciation,
  isFaithfulPronunciation,
  isHebrewLanguage,
  needsPronunciation,
  planToScriptContext,
  reconcilePronunciations,
  validateAdStudioScenes,
  type AdStudioNarrationMode,
  type AdStudioScene,
  type AdStudioVocalizeCheckContext,
} from '@growthos/shared';
import {
  AdStudioScriptInvalidError,
  getAdStudioBrandKit,
  getAdStudioBrief,
  saveAdStudioScript,
  type AdStudioBriefModel,
  type AdStudioGeneratedBy,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { AdStudioProviderError, type AdStudioLlm } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';

/**
 * Hebrew narration vocalizing (KAN-239). Before a Hebrew script is stored, every scene with
 * narration but no pronunciation gets one - the same words with full nikud and numbers written out -
 * so the video model reads the line instead of guessing it. The person sees the pronunciation in the
 * editor and can correct it.
 *
 * Vocalizing is two metered text calls: the vocalizer (`vocalize`), then an independent check
 * (`vocalize_check`, at a higher effort) that reviews each line word by word with the ad's context
 * and returns it corrected. Every answer passes a deterministic guard before it is kept: fully
 * vocalized, and the same letters as the plain line (only numbers and symbols may become words).
 */

export const AdStudioVocalizeSchema = z.object({
  lines: z.array(z.object({ id: z.string(), pronunciation: z.string() })),
});

export const AdStudioVocalizeCheckSchema = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      verdict: z.string().describe('"ok" when the vocalization was right, "fixed" when it was corrected.'),
      pronunciation: z.string().describe('The line with correct full nikud.'),
    }),
  ),
});

/** The ad's context for the check: the business, what is sold, the goal and the audience of the plan. */
export async function vocalizeCheckContext(brief: AdStudioBriefModel): Promise<AdStudioVocalizeCheckContext> {
  let businessName: string | null = null;
  try {
    businessName = (await getAdStudioBrandKit(brief.organization_id, brief.project_id)).brandName || null;
  } catch {
    // The brand name only sharpens the check; it never blocks it.
  }
  const audience = brief.plan ? (planToScriptContext(brief.plan, brief.plan_sources).audience ?? null) : null;
  return { businessName, productDescription: brief.product_description, objective: brief.objective, audience };
}

/**
 * Vocalizes lines and checks the result: one `vocalize` call for all lines, then one `vocalize_check`
 * call that reviews them. Returns the pronunciation each line keeps (see
 * `chooseVerifiedPronunciation`); a line with none is spoken as written. The first call's failure is
 * thrown; the check is best effort - if it fails (limit, provider), the first pass stands.
 */
export async function vocalizeAndVerify(
  ctx: AdStudioCallContext & { briefId: string; lines: readonly { id: string; text: string }[]; context: AdStudioVocalizeCheckContext },
): Promise<Map<string, string>> {
  const prompt = buildVocalizePrompt(ctx.lines);
  const result = await meteredCall(ctx, 'vocalize', ctx.briefId, () => ctx.llm.generateJson({ ...prompt, schema: AdStudioVocalizeSchema, effort: 'medium' }));
  const first = new Map(result.lines.map((line) => [line.id, line.pronunciation.trim()]));
  let checked = new Map<string, string>();
  try {
    const check = buildVocalizeCheckPrompt(
      ctx.lines.map((line) => ({ ...line, pronunciation: first.get(line.id) ?? '' })),
      ctx.context,
    );
    const answer = await meteredCall(ctx, 'vocalize_check', ctx.briefId, () => ctx.llm.generateJson({ ...check, schema: AdStudioVocalizeCheckSchema, effort: 'high' }));
    checked = new Map(answer.lines.map((line) => [line.id, line.pronunciation.trim()]));
  } catch (error) {
    console.warn('[ad-studio] checking the nikud failed; keeping the first vocalization', { briefId: ctx.briefId, error: error instanceof Error ? error.message : String(error) });
  }
  const kept = new Map<string, string>();
  for (const line of ctx.lines) {
    const fromCheck = checked.get(line.id);
    if (fromCheck && !isFaithfulPronunciation(line.text, fromCheck)) {
      console.warn('[ad-studio] the nikud check changed the words or left them bare; not using it', { briefId: ctx.briefId, lineId: line.id });
    }
    const pronunciation = chooseVerifiedPronunciation(line.text, first.get(line.id), fromCheck);
    if (pronunciation) kept.set(line.id, pronunciation);
  }
  return kept;
}

/**
 * Fills in the pronunciation of every scene that needs one (the vocalizer and its check, one call
 * each for the whole script). A line with no faithful answer stays without one. Scenes that need
 * nothing are returned as they are, without a call. `onlySceneIds` limits it to those scenes.
 */
export async function vocalizeAdStudioScenes(
  ctx: AdStudioCallContext & {
    briefId: string;
    language: string;
    scenes: readonly AdStudioScene[];
    context: AdStudioVocalizeCheckContext;
    onlySceneIds?: ReadonlySet<string>;
  },
): Promise<{ scenes: AdStudioScene[]; vocalized: number }> {
  const wanted = (scene: AdStudioScene) => needsPronunciation(scene, ctx.language) && (!ctx.onlySceneIds || ctx.onlySceneIds.has(scene.id));
  const pending = ctx.scenes.filter(wanted);
  if (pending.length === 0) return { scenes: [...ctx.scenes], vocalized: 0 };
  const byId = await vocalizeAndVerify({ ...ctx, lines: pending.map((scene) => ({ id: scene.id, text: scene.voiceover })) });
  let vocalized = 0;
  const scenes = ctx.scenes.map((scene) => {
    const pronunciation = wanted(scene) ? byId.get(scene.id) : undefined;
    if (!pronunciation) return scene;
    vocalized += 1;
    return { ...scene, pronunciation };
  });
  return { scenes, vocalized };
}

/**
 * Vocalizes one narration text on request and returns it without saving (KAN-239): the editors'
 * "add nikud" button, so a person sees the nikud of the words they just typed and can correct it
 * before saving. The vocalizer and its check (two metered calls); refused for an ad that is not in Hebrew.
 */
export async function vocalizeNarrationText(ctx: AdStudioCallContext & { briefId: string; text: string }): Promise<string> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const text = ctx.text.replace(/\s+/g, ' ').trim();
  if (!text || !isHebrewLanguage(brief.language)) throw new AdStudioProviderError('invalid_output', 'Only Hebrew narration is vocalized.');
  const kept = await vocalizeAndVerify({ ...ctx, briefId: brief.id, lines: [{ id: 'line', text }], context: await vocalizeCheckContext(brief) });
  const pronunciation = kept.get('line');
  if (!pronunciation) throw new AdStudioProviderError('invalid_output', 'The model returned no usable nikud.');
  return pronunciation;
}

/**
 * Saves a script, first vocalizing the Hebrew narration that has no pronunciation - including every
 * line whose words changed, since a pronunciation of the old words is dropped. Vocalizing is best
 * effort: with no text model, over the daily limit or on a provider failure the script is saved as
 * written and its narration is spoken without the guide. A script that breaks the scene rules is
 * refused before any model call.
 */
export async function saveAdStudioScriptWithPronunciation(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  scenes: AdStudioScene[];
  actorId: string;
  llm: AdStudioLlm | null;
  generatedBy?: AdStudioGeneratedBy | null;
  /** Vocalize only these scenes (the autopilot passes the ones it is about to render). */
  onlySceneIds?: ReadonlySet<string>;
  /** The narration mode the script writer read from the brief, stored with the script. */
  detectedNarrationMode?: AdStudioNarrationMode | null;
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const issues = validateAdStudioScenes(params.scenes);
  if (issues.length) throw new AdStudioScriptInvalidError(issues);
  await ensureOrm();
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  let scenes = reconcilePronunciations(brief.scenes ?? [], params.scenes);
  if (params.llm && scenes.some((scene) => needsPronunciation(scene, brief.language))) {
    try {
      ({ scenes } = await vocalizeAdStudioScenes({ ...params, llm: params.llm, language: brief.language, scenes, context: await vocalizeCheckContext(brief) }));
    } catch (error) {
      console.warn('[ad-studio] vocalizing the narration failed; saving the script without it', { briefId: brief.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return saveAdStudioScript({ ...params, scenes });
}
