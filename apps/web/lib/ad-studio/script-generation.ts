import 'server-only';
import { z } from 'zod/v4';
import {
  buildSceneRewritePrompt,
  buildScriptPrompt,
  fitAdStudioScenes,
  type AdStudioScene,
  type AdStudioScriptContext,
} from '@growthos/shared';
import {
  adStudioBriefInput,
  assertAdStudioQuota,
  getAdStudioBrief,
  newAdStudioSceneId,
  recordAdStudioUsage,
  saveAdStudioScript,
  type AdStudioBriefModel,
  type AdStudioUsageKind,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { AdStudioProviderError, type AdStudioLlm } from './llm';

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

interface CallContext {
  organizationId: string;
  projectId: string;
  actorId: string;
  llm: AdStudioLlm;
  now?: Date;
}

/**
 * Runs one model call inside the project's daily limit and logs it either way. The limit is checked
 * before the call so a refused call costs nothing; the usage row is written after it, succeeded or
 * failed, since a failed provider call can still be billed.
 */
async function meteredCall<T>(ctx: CallContext, kind: AdStudioUsageKind, briefId: string, run: () => Promise<T>): Promise<T> {
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind, units: 1, now: ctx.now });
  const base = {
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    kind,
    provider: ctx.llm.provider,
    model: ctx.llm.model,
    units: 1,
    briefId,
    actorId: ctx.actorId,
    now: ctx.now,
  };
  try {
    const result = await run();
    await recordAdStudioUsage({ ...base, outcome: 'succeeded' });
    return result;
  } catch (error) {
    const reason = error instanceof AdStudioProviderError ? error.code : 'provider_error';
    await recordAdStudioUsage({ ...base, outcome: 'failed', failureReason: reason });
    throw error;
  }
}

function toScenes(generated: GeneratedScript['scenes']): AdStudioScene[] {
  return generated.map((scene) => ({
    id: newAdStudioSceneId(),
    durationSeconds: scene.durationSeconds,
    visualPrompt: scene.visualPrompt,
    voiceover: scene.voiceover,
    onScreenText: scene.onScreenText,
  }));
}

/** Writes the whole script for a brief with the text model, fits it to the scene rules and saves it. */
export async function generateAdStudioScript(
  ctx: CallContext & { briefId: string; context?: AdStudioScriptContext },
): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const prompt = buildScriptPrompt(adStudioBriefInput(brief), ctx.context);
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
export async function proposeAdStudioSceneRewrite(ctx: CallContext & { briefId: string; sceneId: string; instruction: string }): Promise<AdStudioScene> {
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
