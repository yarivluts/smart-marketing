import { z } from 'zod/v4';
import { buildAdCopyPrompt, fitAdCopy, isAdCopyEmpty, planToScriptContext, type AdStudioAdCopy, type AdStudioCopyTarget } from '@growthos/shared';
import { adStudioBriefInput, getAdStudioBrief, saveAdStudioCopy, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { meteredCall, type AdStudioCallContext } from './metering';

/** The ad copy a model writes for a creative (KAN-278); `fitAdCopy` enforces the limits afterwards. */
export const AdCopySchema = z.object({
  headline: z.string().describe('At most 30 characters.'),
  primaryText: z.string().describe('At most 90 characters, shown above the media.'),
  description: z.string().describe('At most 90 characters, shown under the media.'),
});

const WrittenCopySchema = z.object({
  items: z.array(AdCopySchema.extend({ key: z.string().describe('The creative key, unchanged.') })),
});

/** What a creative shows or says, for the copy prompt. */
function videoAbout(brief: AdStudioBriefModel): string {
  return brief.scenes.map((scene, index) => `Scene ${index + 1}: ${scene.visualPrompt}${scene.voiceover ? ` | narration: ${scene.voiceover}` : ''}`).join(' / ');
}

/**
 * Writes the ad copy of the ad's creatives in one metered text call (kind `ad_copy`): the video when
 * it has a script, and every image idea. By default only creatives without copy are written, so a
 * person's own copy is kept; `rewrite` writes them all again, and `keys` ("video" or idea ids) limits
 * the call to those creatives. Returns the brief unchanged, without a call, when nothing needs copy.
 */
export async function writeAdStudioCopy(ctx: AdStudioCallContext & { briefId: string; rewrite?: boolean; keys?: readonly string[] }): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const wanted = (key: string, copy: AdStudioAdCopy | null | undefined) => (!ctx.keys || ctx.keys.includes(key)) && (ctx.rewrite || isAdCopyEmpty(copy));
  const targets: AdStudioCopyTarget[] = [];
  if (brief.scenes.length > 0 && wanted('video', brief.video_copy)) targets.push({ key: 'video', kind: 'video', about: videoAbout(brief) });
  for (const concept of brief.image_concepts ?? []) {
    if (wanted(concept.id, concept.copy)) targets.push({ key: concept.id, kind: 'image', about: `${concept.visualPrompt}${concept.headline ? ` | text in the image: ${concept.headline}` : ''}` });
  }
  if (targets.length === 0) return brief;
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const prompt = buildAdCopyPrompt(adStudioBriefInput(brief), targets, context);
  const written = await meteredCall(ctx, 'ad_copy', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: WrittenCopySchema }));
  const byKey = new Map(written.items.map((item) => [item.key, fitAdCopy(item)]));
  const video = targets.some((target) => target.key === 'video') ? byKey.get('video') : undefined;
  const conceptCopies = Object.fromEntries(
    targets.filter((target) => target.kind === 'image' && byKey.get(target.key)).map((target) => [target.key, byKey.get(target.key) as AdStudioAdCopy]),
  );
  if (!video && Object.keys(conceptCopies).length === 0) return brief;
  return saveAdStudioCopy({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    ...(video ? { videoCopy: video } : {}),
    ...(Object.keys(conceptCopies).length ? { conceptCopies } : {}),
    now: ctx.now,
  });
}
