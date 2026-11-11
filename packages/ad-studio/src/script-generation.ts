import { z } from 'zod/v4';
import { AdCopySchema } from './copy-writing';
import {
  DEFAULT_AD_STUDIO_NARRATION_MODE,
  applyNarrationMode,
  buildSceneRewritePrompt,
  buildScriptPrompt,
  fitAdCopy,
  fitAdStudioScenes,
  isAdCopyEmpty,
  isAdStudioDelivery,
  isAdStudioNarrationMode,
  planToScriptContext,
  type AdStudioScene,
  type AdStudioScriptContext,
} from '@growthos/shared';
import { adStudioNarrationMode, getAdStudioBrief, newAdStudioSceneId, saveAdStudioCopy, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { briefPromptInput } from './brand';
import { ensureOrm } from './runtime';
import { AdStudioProviderError } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';
import { saveAdStudioScriptWithPronunciation } from './vocalize';

const GeneratedSceneSchema = z.object({
  durationSeconds: z.number().describe('Whole seconds, 3 to 10.'),
  visualPrompt: z.string().describe('What the camera sees, in English, for a text-to-video model.'),
  voiceover: z.string().describe('Narration in the ad language, or empty.'),
  onScreenText: z.string().describe('Text shown in the frame, in the ad language, or empty.'),
  delivery: z.string().optional().describe('Who says the voiceover: "voiceover" (an off-screen narrator, never seen) or "on_screen" (a person in the shot, to the camera). Follow the narration mode.'),
  speaker: z.string().optional().describe('For "on_screen": the one person who speaks, described the same way in every scene (age, gender, look, clothing). Empty otherwise.'),
});

export const GeneratedScriptSchema = z.object({
  title: z.string(),
  narrationMode: z.string().optional().describe('Who narrates the ad: "voiceover", "on_camera" or "mixed", as the narration rules say.'),
  scenes: z.array(GeneratedSceneSchema),
  copy: AdCopySchema.optional().describe('The ad text that runs next to the finished video in the feed, in the ad language (KAN-278).'),
});

export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;
type GeneratedScene = z.infer<typeof GeneratedSceneSchema>;

/** A generated scene's delivery fields, when the model gave a valid one; the narration mode settles the rest. */
function generatedDelivery(scene: GeneratedScene): Pick<AdStudioScene, 'delivery' | 'speaker'> {
  return isAdStudioDelivery(scene.delivery) ? { delivery: scene.delivery, ...(scene.speaker?.trim() ? { speaker: scene.speaker } : {}) } : {};
}

function toScenes(generated: GeneratedScript['scenes']): AdStudioScene[] {
  return generated.map((scene) => ({
    id: newAdStudioSceneId(),
    durationSeconds: scene.durationSeconds,
    visualPrompt: scene.visualPrompt,
    voiceover: scene.voiceover,
    onScreenText: scene.onScreenText,
    ...generatedDelivery(scene),
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
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = ctx.context ?? (brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : undefined);
  const prompt = buildScriptPrompt(await briefPromptInput(brief), context);
  const generated = await meteredCall(ctx, 'script', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedScriptSchema }));
  const scenes = fitAdStudioScenes(toScenes(generated.scenes), newAdStudioSceneId);
  if (scenes.length === 0 || scenes.some((scene) => scene.visualPrompt.length === 0)) {
    throw new AdStudioProviderError('invalid_output', 'The model returned a scene without a visual description.');
  }
  // The video's ad copy comes with the script; a person's own copy is never replaced by a new script.
  const videoCopy = fitAdCopy(generated.copy);
  if (videoCopy && isAdCopyEmpty(brief.video_copy)) await saveAdStudioCopy({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, videoCopy });
  // Hebrew narration is vocalized before it is stored (best effort - see the vocalizer).
  return saveAdStudioScriptWithPronunciation({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    scenes,
    actorId: ctx.actorId,
    llm: ctx.llm,
    generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model, generated_at: (ctx.now ?? new Date()).toISOString() },
    // In automatic mode the writer read the mode from the brief; it is stored, and the saved script is
    // made to follow it in code (voice-over clears every on-screen speaker). A chosen mode is never replaced.
    detectedNarrationMode: brief.narration_mode ? undefined : isAdStudioNarrationMode(generated.narrationMode) ? generated.narrationMode : DEFAULT_AD_STUDIO_NARRATION_MODE,
    now: ctx.now,
  });
}

/**
 * Rewrites one scene of the brief's current script by an instruction and returns the proposed scene
 * without saving it: the editor shows it in place and the person keeps or discards it, so an AI
 * rewrite never silently replaces work. The proposal keeps the scene's id and is fitted on its own.
 */
export async function proposeAdStudioSceneRewrite(
  ctx: AdStudioCallContext & {
    briefId: string;
    sceneId: string;
    instruction: string;
    /** The editor's current scenes, unsaved edits and new scenes included; the saved script when absent. */
    draftScenes?: readonly AdStudioScene[];
  },
): Promise<AdStudioScene> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  // Rewrite what the person is looking at, so a new or edited scene is rewritten as it stands.
  const scenes = ctx.draftScenes?.length ? ctx.draftScenes : brief.scenes;
  const index = scenes.findIndex((scene) => scene.id === ctx.sceneId);
  if (index < 0) throw new AdStudioProviderError('invalid_output', 'That scene is no longer in the script.');
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const mode = adStudioNarrationMode(brief);
  const prompt = buildSceneRewritePrompt({ ...(await briefPromptInput(brief)), narrationMode: mode }, scenes, index, ctx.instruction, context);
  const generated = await meteredCall(ctx, 'scene_rewrite', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedSceneSchema }));
  const { delivery: _delivery, speaker: _speaker, ...rest } = generated;
  const [fitted] = fitAdStudioScenes([{ id: ctx.sceneId, ...rest, ...generatedDelivery(generated) }], newAdStudioSceneId);
  if (!fitted || fitted.visualPrompt.length === 0) throw new AdStudioProviderError('invalid_output', 'The model returned a scene without a visual description.');
  // The proposal follows the ad's narration mode as the saved script will (one presenter on camera).
  const proposed = applyNarrationMode(
    scenes.map((scene) => (scene.id === ctx.sceneId ? fitted : scene)),
    mode,
  ).find((scene) => scene.id === ctx.sceneId);
  return proposed ?? fitted;
}
