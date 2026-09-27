import 'server-only';
import { z } from 'zod/v4';
import {
  buildSceneRewritePrompt,
  buildScriptPrompt,
  fitAdStudioScenes,
  planToScriptContext,
  type AdStudioScene,
  type AdStudioScriptContext,
} from '@growthos/shared';
import { adStudioBriefInput, getAdStudioBrief, newAdStudioSceneId, saveAdStudioScript, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { AdStudioProviderError } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';

const GeneratedSceneSchema = z.object({
  durationSeconds: z.number().describe('Whole seconds, 3 to 10.'),
  visualPrompt: z.string().describe('What the camera sees, in English, for a text-to-video model.'),
  voiceover: z.string().describe('Narration in the ad language, or empty.'),
  onScreenText: z.string().describe('Text shown in the frame, in the ad language, or empty.'),
});

export const GeneratedScriptSchema = z.object({
  title: z.string(),
  scenes: z.array(GeneratedSceneSchema),
});

export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;

function toScenes(generated: GeneratedScript['scenes']): AdStudioScene[] {
  return generated.map((scene) => ({
    id: newAdStudioSceneId(),
    durationSeconds: scene.durationSeconds,
    visualPrompt: scene.visualPrompt,
    voiceover: scene.voiceover,
    onScreenText: scene.onScreenText,
  }));
}

/**
 * Writes the whole script for a brief with the text model, fits it to the scene rules and saves it.
 * Builds on the brief's stored plan (KAN-230) - its audience, angles, keyword themes and landing
 * page summary - unless the caller passes a context of its own.
 */
export async function generateAdStudioScript(
  ctx: AdStudioCallContext & { briefId: string; context?: AdStudioScriptContext },
): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = ctx.context ?? (brief.plan ? planToScriptContext(brief.plan) : undefined);
  const prompt = buildScriptPrompt(adStudioBriefInput(brief), context);
  const generated = await meteredCall(ctx, 'script', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedScriptSchema }));
  const scenes = fitAdStudioScenes(toScenes(generated.scenes), newAdStudioSceneId);
  if (scenes.length === 0 || scenes.some((scene) => scene.visualPrompt.length === 0)) {
    throw new AdStudioProviderError('invalid_output', 'The model returned a scene without a visual description.');
  }
  return saveAdStudioScript({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    scenes,
    generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model, generated_at: (ctx.now ?? new Date()).toISOString() },
    now: ctx.now,
  });
}

/**
 * Rewrites one scene of the brief's current script by an instruction and returns the proposed scene
 * without saving it: the editor shows it in place and the person keeps or discards it, so an AI
 * rewrite never silently replaces work. The proposal keeps the scene's id and is fitted on its own.
 */
export async function proposeAdStudioSceneRewrite(ctx: AdStudioCallContext & { briefId: string; sceneId: string; instruction: string }): Promise<AdStudioScene> {
  await ensureFirestoreOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const index = brief.scenes.findIndex((scene) => scene.id === ctx.sceneId);
  if (index < 0) throw new AdStudioProviderError('invalid_output', 'That scene is no longer in the script.');
  const prompt = buildSceneRewritePrompt(adStudioBriefInput(brief), brief.scenes, index, ctx.instruction);
  const generated = await meteredCall(ctx, 'scene_rewrite', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedSceneSchema }));
  const [fitted] = fitAdStudioScenes([{ id: ctx.sceneId, ...generated }], newAdStudioSceneId);
  if (!fitted || fitted.visualPrompt.length === 0) throw new AdStudioProviderError('invalid_output', 'The model returned a scene without a visual description.');
  return fitted;
}
