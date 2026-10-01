import { z } from 'zod/v4';
import {
  buildVocalizePrompt,
  isUsablePronunciation,
  needsPronunciation,
  reconcilePronunciations,
  validateAdStudioScenes,
  type AdStudioScene,
} from '@growthos/shared';
import {
  AdStudioScriptInvalidError,
  getAdStudioBrief,
  saveAdStudioScript,
  type AdStudioBriefModel,
  type AdStudioGeneratedBy,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import type { AdStudioLlm } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';

/**
 * Hebrew narration vocalizing (KAN-239). Before a Hebrew script is stored, every scene with
 * narration but no pronunciation gets one - the same words with full nikud and numbers written out -
 * in a single metered text call, so the video model reads the line instead of guessing it. The
 * person sees the pronunciation in the editor and can correct it.
 */

export const AdStudioVocalizeSchema = z.object({
  lines: z.array(z.object({ id: z.string(), pronunciation: z.string() })),
});

/**
 * Fills in the pronunciation of every scene that needs one (kind `vocalize`, one text call for the
 * whole script). A line the model returns unusable stays without one. Scenes that need nothing are
 * returned as they are, without a call.
 */
export async function vocalizeAdStudioScenes(
  ctx: AdStudioCallContext & { briefId: string; language: string; scenes: readonly AdStudioScene[] },
): Promise<{ scenes: AdStudioScene[]; vocalized: number }> {
  const pending = ctx.scenes.filter((scene) => needsPronunciation(scene, ctx.language));
  if (pending.length === 0) return { scenes: [...ctx.scenes], vocalized: 0 };
  const prompt = buildVocalizePrompt(pending.map((scene) => ({ id: scene.id, text: scene.voiceover })));
  const result = await meteredCall(ctx, 'vocalize', ctx.briefId, () => ctx.llm.generateJson({ ...prompt, schema: AdStudioVocalizeSchema }));
  const byId = new Map(result.lines.map((line) => [line.id, line.pronunciation.trim()]));
  let vocalized = 0;
  const scenes = ctx.scenes.map((scene) => {
    const pronunciation = needsPronunciation(scene, ctx.language) ? byId.get(scene.id) : undefined;
    if (!pronunciation || !isUsablePronunciation(pronunciation)) return scene;
    vocalized += 1;
    return { ...scene, pronunciation };
  });
  return { scenes, vocalized };
}

/**
 * Saves a script, first vocalizing the Hebrew narration that has no pronunciation. Vocalizing is
 * best effort: with no text model, over the daily limit or on a provider failure the script is saved
 * as written and its narration is spoken without the guide. A script that breaks the scene rules is
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
  now?: Date;
}): Promise<AdStudioBriefModel> {
  const issues = validateAdStudioScenes(params.scenes);
  if (issues.length) throw new AdStudioScriptInvalidError(issues);
  await ensureOrm();
  const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
  let scenes = reconcilePronunciations(brief.scenes ?? [], params.scenes);
  if (params.llm && scenes.some((scene) => needsPronunciation(scene, brief.language))) {
    try {
      ({ scenes } = await vocalizeAdStudioScenes({ ...params, llm: params.llm, language: brief.language, scenes }));
    } catch (error) {
      console.warn('[ad-studio] vocalizing the narration failed; saving the script without it', { briefId: brief.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return saveAdStudioScript({ ...params, scenes });
}
