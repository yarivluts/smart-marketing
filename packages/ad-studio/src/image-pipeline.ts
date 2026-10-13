import { z } from 'zod/v4';
import {
  AD_STUDIO_COPY_LIMITS,
  AD_STUDIO_IMAGE_HEADLINE_MAX,
  AD_STUDIO_IMAGE_ASPECT_RATIO,
  AD_STUDIO_IMAGE_INSTRUCTION_MAX,
  buildImageConceptRewritePrompt,
  buildImageConceptsPrompt,
  buildImagePrompt,
  fitAdStudioImageConcepts,
  imageConceptFingerprint,
  isAdStudioImageFormat,
  planToScriptContext,
  type AdStudioImageFormat,
} from '@growthos/shared';
import {
  assertAdStudioQuota,
  createAdStudioImage,
  exportAdStudioImage,
  getAdStudioBrief,
  getAdStudioImage,
  getAdStudioSettings,
  listAdStudioImages,
  markAdStudioImageFailed,
  markAdStudioImageReady,
  newAdStudioSceneId,
  recordAdStudioUsage,
  saveAdStudioImageConcepts,
  selectAdStudioImage,
  type AdStudioBriefModel,
  type AdStudioExportModel,
  type AdStudioImageExportDestination,
  type AdStudioImageModel,
  type AdStudioImageQa,
} from '@growthos/firebase-orm-models';
import { briefPromptInput } from './brand';
import { ensureOrm, getServerKmsProvider } from './runtime';
import { AdStudioProviderError, resolveAdStudioLlm, resolveAdStudioReviewer, type AdStudioLlm, type AdStudioReviewer } from './llm';
import { canOverlayHeadline, overlayHeadline } from './headline-overlay';
import { betterImageVerdict, reviewAdStudioImage, type ImageQaSubject, type ImageQaVerdict } from './image-qa';
import { englishForModel } from './translate';
import { meteredCall, type AdStudioCallContext } from './metering';
import { repairOverLength } from './length-repair';
import { AdCopySchema } from './copy-writing';
import { resolveAdStudioImageGenerator, type AdStudioGeneratedImage, type AdStudioImageGenerator } from './gemini-image';
import { adStudioImageObjectPath, readAdStudioObject, resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';
import type { AdStudioImageView } from './view';

/** A stored ad image is a few MB at most; reading one for an edit or export is capped well above that. */
const MAX_STORED_IMAGE_BYTES = 25 * 1024 * 1024;

export type AdStudioImageRequestCode = 'concept_not_found' | 'format_not_in_concept' | 'image_not_editable' | 'invalid_instruction' | 'image_not_ready';

export class AdStudioImageRequestError extends Error {
  constructor(public readonly code: AdStudioImageRequestCode) {
    super(`The image request cannot be done: ${code}`);
    this.name = 'AdStudioImageRequestError';
  }
}

export interface AdStudioImageDeps {
  /** Null when no image model is configured (no GEMINI_API_KEY). */
  images: AdStudioImageGenerator | null;
  storage: AdStudioMediaStorage;
  /** Translates a picture described in Hebrew into English for the image model; absent or null sends it as written. */
  llm?: AdStudioLlm | null;
  /** Checks each finished image (spelling of the headline, stray text, deformed hands); absent or null skips the check. */
  reviewer?: AdStudioReviewer | null;
  now?: () => Date;
}

export function resolveAdStudioImageDeps(env: NodeJS.ProcessEnv = process.env): AdStudioImageDeps {
  return { images: resolveAdStudioImageGenerator(env), storage: resolveAdStudioMediaStorage(env), llm: resolveAdStudioLlm(env), reviewer: resolveAdStudioReviewer(env) };
}

interface BriefContext {
  organizationId: string;
  projectId: string;
  briefId: string;
  actorId: string;
}

export function toAdStudioImageView(image: AdStudioImageModel): AdStudioImageView {
  return {
    id: image.id,
    conceptId: image.concept_id,
    format: image.image_format,
    kind: image.kind,
    version: image.version,
    status: image.status,
    selected: image.selected,
    parentImageId: image.parent_image_id ?? null,
    instruction: image.instruction ?? null,
    conceptFingerprint: image.concept_fingerprint,
    failureCode: image.failure_code ?? null,
    mimeType: image.mime_type ?? null,
    requestedOn: image.requested_on,
    completedOn: image.completed_on ?? null,
    imageSize: image.image_size ?? null,
    qa: image.qa ? { status: image.qa.status, issues: image.qa.issues, renders: image.qa.renders, ...(image.qa.overlay ? { overlay: true } : {}) } : null,
  };
}

const GeneratedConceptsSchema = z.object({
  concepts: z.array(
    z.object({
      visualPrompt: z.string().describe('What the picture shows, in English, for an image model. No text in the picture here.'),
      headline: z.string().describe('The only text drawn into the image, in the ad language, at most 40 characters, or empty.'),
      formats: z.array(z.string()).describe('Placements this idea suits: square, portrait, story, landscape.'),
      copy: AdCopySchema.optional().describe('The ad text that runs next to this idea in the feed, in the ad language.'),
    }),
  ),
});

type GeneratedConcept = z.infer<typeof GeneratedConceptsSchema>['concepts'][number];

/** Over-long image headlines and copy are rewritten to fit their limits, not cut mid-word. */
async function repairConceptLengths(ctx: AdStudioCallContext, brief: AdStudioBriefModel, concepts: readonly GeneratedConcept[]): Promise<GeneratedConcept[]> {
  const copyFields = ['headline', 'primaryText', 'description'] as const;
  const repaired = await repairOverLength(
    ctx,
    'image_concepts',
    brief.id,
    brief.language,
    concepts.flatMap((concept, index) => [
      { id: `c${index}:image`, text: concept.headline, max: AD_STUDIO_IMAGE_HEADLINE_MAX },
      ...copyFields.map((field) => ({ id: `c${index}:${field}`, text: concept.copy?.[field] ?? '', max: AD_STUDIO_COPY_LIMITS[field] })),
    ]),
  );
  return concepts.map((concept, index) => ({
    ...concept,
    headline: repaired.get(`c${index}:image`) ?? concept.headline,
    ...(concept.copy ? { copy: Object.fromEntries(copyFields.map((field) => [field, repaired.get(`c${index}:${field}`) ?? concept.copy?.[field] ?? ''])) as typeof concept.copy } : {}),
  }));
}

/**
 * Writes image ad ideas for a brief with the text model (building on its plan and video script when
 * present) and saves them, replacing the earlier list. When the person chose placements (`formats`),
 * every idea is rendered in all of them; otherwise each idea keeps the placements the model suggested.
 */
export async function generateAdStudioImageConcepts(ctx: AdStudioCallContext & { briefId: string; formats?: readonly AdStudioImageFormat[] }): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const prompt = buildImageConceptsPrompt(await briefPromptInput(brief), { ...context, scenes: brief.scenes });
  const raw = await meteredCall(ctx, 'image_concepts', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedConceptsSchema }));
  const generated = { concepts: await repairConceptLengths(ctx, brief, raw.concepts) };
  const allowed = ctx.formats?.length ? ctx.formats.filter(isAdStudioImageFormat) : null;
  const concepts = fitAdStudioImageConcepts(
    // Placements the person chose apply to every idea; otherwise the model's own choice per idea stands.
    generated.concepts.map((concept) => ({ ...concept, formats: allowed ?? concept.formats })),
    newAdStudioSceneId,
    allowed ?? ['square', 'portrait'],
  );
  if (concepts.length === 0) throw new AdStudioProviderError('invalid_output', 'The model returned no usable image idea.');
  return saveAdStudioImageConcepts({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    concepts,
    generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model, generated_at: (ctx.now ?? new Date()).toISOString() },
    now: ctx.now,
  });
}

/**
 * Rewrites one image idea by the editor's instruction and saves it in place, leaving the other ideas
 * untouched. The idea keeps its id and its placements, so its rendered images stay attached (and show
 * as out of date once the picture or headline changed); its copy is replaced only when the model wrote new copy.
 */
export async function rewriteAdStudioImageConcept(ctx: AdStudioCallContext & { briefId: string; conceptId: string; instruction: string }): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const concepts = brief.image_concepts ?? [];
  const index = concepts.findIndex((concept) => concept.id === ctx.conceptId);
  if (index < 0) throw new AdStudioImageRequestError('concept_not_found');
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const prompt = buildImageConceptRewritePrompt(await briefPromptInput(brief), concepts, index, ctx.instruction, context);
  const raw = await meteredCall(ctx, 'image_concepts', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedConceptsSchema }));
  const [rewritten] = await repairConceptLengths(ctx, brief, raw.concepts.slice(0, 1));
  const original = concepts[index];
  const [fitted] = rewritten ? fitAdStudioImageConcepts([{ ...rewritten, formats: original.formats }], () => original.id, original.formats) : [];
  if (!fitted) throw new AdStudioProviderError('invalid_output', 'The model returned no usable image idea.');
  return saveAdStudioImageConcepts({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    concepts: concepts.map((concept, at) => (at === index ? { ...fitted, ...(fitted.copy ? {} : original.copy ? { copy: original.copy } : {}) } : concept)),
    generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model, generated_at: (ctx.now ?? new Date()).toISOString() },
    now: ctx.now,
  });
}

/** The project's quality-check setting (shared with video) and how many re-renders a failing image gets. */
interface ImageCheckPlan {
  enabled: boolean;
  retries: number;
}

/**
 * Renders, checks and - while the check finds a major problem and retries remain - renders again,
 * keeping the best image. Each retry is guided, not a blind re-roll: the check's English fix for every
 * major problem so far ("the phone fits in one hand") goes to the image model with the next render. Every render counts toward the daily image limit; a retry the limit no
 * longer allows, or one the provider refuses, ends the loop with the best image so far.
 */
async function renderChecked(
  ctx: BriefContext,
  deps: AdStudioImageDeps,
  kind: 'image' | 'image_edit',
  check: ImageCheckPlan,
  subject: ImageQaSubject,
  render: (fixes: readonly string[]) => Promise<AdStudioGeneratedImage>,
  /** The last resort when every guided render still fails: a text-free picture with the headline drawn in code. */
  fallback?: (fixes: readonly string[]) => Promise<AdStudioGeneratedImage>,
): Promise<{ image: AdStudioGeneratedImage; renders: number; qa: AdStudioImageQa }> {
  const reviewer = check.enabled ? (deps.reviewer ?? null) : null;
  // An image costs a fraction of a clip, so with re-renders on it gets at least AD_STUDIO_MIN_IMAGE_RETRIES; 0 stays 0.
  const retries = check.retries > 0 ? Math.max(check.retries, AD_STUDIO_MIN_IMAGE_RETRIES) : 0;
  const attempts = reviewer ? 1 + retries : 1;
  const started = Date.now();
  let best: { image: AdStudioGeneratedImage; verdict: ImageQaVerdict } | null = null;
  let renders = 0;
  const fixes: string[] = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      // No new attempt late in the request: it must end well inside the server timeout.
      if (Date.now() - started > IMAGE_ATTEMPT_BUDGET_MS) break;
      try {
        await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind, units: 1, now: deps.now?.() });
      } catch {
        break;
      }
    }
    let image: AdStudioGeneratedImage;
    try {
      renders += 1;
      image = await render(fixes);
    } catch (error) {
      if (!best) throw Object.assign(error instanceof Error ? error : new Error(String(error)), { renders });
      break;
    }
    const verdict: ImageQaVerdict = reviewer
      ? await reviewAdStudioImage({ ...ctx, image, subject, reviewer, now: deps.now?.() })
      : { status: 'skipped', issues: [], text: null, model: null };
    if (!best || betterImageVerdict(verdict, best.verdict)) best = { image, verdict };
    if (verdict.status !== 'issues') break;
    for (const fix of verdict.fixes ?? []) if (!fixes.includes(fix)) fixes.push(fix);
  }
  let overlay = false;
  // Still failing after the guided renders: one text-free render with the headline set in code, so the words
  // are always right, checked like any other image and kept only when it is better.
  if (reviewer && fallback && best?.verdict.status === 'issues' && Date.now() - started <= IMAGE_FALLBACK_BUDGET_MS) {
    try {
      await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind, units: 1, now: deps.now?.() });
      renders += 1;
      const image = await fallback(fixes);
      const verdict = await reviewAdStudioImage({ ...ctx, image, subject: { ...subject, headlineSetByCode: true }, reviewer, now: deps.now?.() });
      if (betterImageVerdict(verdict, best.verdict)) {
        best = { image, verdict };
        overlay = true;
      }
    } catch (error) {
      // The images made so far stand; the last resort failing (limit, provider, font) changes nothing.
      console.error('[ad-studio] headline fallback failed', { briefId: ctx.briefId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const chosen = best as { image: AdStudioGeneratedImage; verdict: ImageQaVerdict };
  const { status, issues, text, model } = chosen.verdict;
  return { image: chosen.image, renders, qa: { status, issues, text, model, renders, ...(overlay ? { overlay: true } : {}) } };
}

/**
 * The web and api services allow a request 600 s (infra/terraform/cloud_run.tf). A slow image call takes
 * up to ~2 minutes plus ~15 s of checking, so attempts start only while one more still fits: on prod a
 * 300 s limit (budgets of 170/210 s) cut slow landscape renders off after two tries, before the last resort.
 */
/** The text-free last resort starts only while it can still finish inside the server timeout. */
const IMAGE_FALLBACK_BUDGET_MS = 430_000;

/** Images are cheap next to video: with re-renders on, an image gets at least this many guided re-renders. */
export const AD_STUDIO_MIN_IMAGE_RETRIES = 2;
/** No new guided attempt starts after this long, leaving room for the last resort. */
const IMAGE_ATTEMPT_BUDGET_MS = 380_000;

/** The prompt for a retry: the original request, then what the check found wrong in the earlier render and how to draw it instead. */
export function withFixes(prompt: string, fixes: readonly string[]): string {
  return fixes.length ? `${prompt}\nAn earlier render of this picture had problems. This time: ${fixes.join(' ')}` : prompt;
}

/** Runs the image calls inside the daily image limit, stores the kept image and records the usage either way. */
async function produceImage(
  ctx: BriefContext,
  deps: AdStudioImageDeps,
  record: AdStudioImageModel,
  kind: 'image' | 'image_edit',
  check: ImageCheckPlan,
  subject: ImageQaSubject,
  call: (generator: AdStudioImageGenerator, fixes: readonly string[]) => Promise<AdStudioGeneratedImage>,
  fallback?: (generator: AdStudioImageGenerator, fixes: readonly string[]) => Promise<AdStudioGeneratedImage>,
): Promise<AdStudioImageModel> {
  const now = deps.now ?? (() => new Date());
  const usage = { organizationId: ctx.organizationId, projectId: ctx.projectId, kind, provider: 'gemini', model: record.model, briefId: ctx.briefId, actorId: ctx.actorId };
  try {
    const generator = deps.images;
    if (!generator) throw new AdStudioProviderError('not_configured', 'No image model is configured.');
    const { image, renders, qa } = await renderChecked(ctx, deps, kind, check, subject, (fixes) => call(generator, fixes), fallback ? (fixes) => fallback(generator, fixes) : undefined);
    const objectPath = adStudioImageObjectPath({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: ctx.briefId, imageId: record.id, mimeType: image.mimeType });
    await deps.storage.upload(objectPath, image.bytes, image.mimeType);
    await recordAdStudioUsage({ ...usage, units: renders, outcome: 'succeeded', now: now() });
    return await markAdStudioImageReady(record, { gcsPath: objectPath, mimeType: image.mimeType, byteSize: image.bytes.length, qa, now: now() });
  } catch (error) {
    const code = error instanceof AdStudioProviderError ? error.code : 'storage_error';
    const message = error instanceof Error ? error.message : String(error);
    const renders = (error as { renders?: number }).renders ?? 1;
    if (code !== 'not_configured') await recordAdStudioUsage({ ...usage, units: renders, outcome: 'failed', failureReason: code, now: now() });
    await markAdStudioImageFailed(record, { code, message, now: now() });
    if (error instanceof AdStudioProviderError) throw error;
    throw new AdStudioProviderError('provider_error', message);
  }
}

/**
 * Renders one concept in one placement: a new version that becomes the selected one when it
 * succeeds. The daily image limit is checked first, so a refused render costs nothing.
 */
export async function renderAdStudioConceptImage(ctx: BriefContext & { conceptId: string; format: AdStudioImageFormat }, deps: AdStudioImageDeps): Promise<AdStudioImageModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const concept = (brief.image_concepts ?? []).find((candidate) => candidate.id === ctx.conceptId);
  if (!concept) throw new AdStudioImageRequestError('concept_not_found');
  if (!concept.formats.includes(ctx.format)) throw new AdStudioImageRequestError('format_not_in_concept');
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'image', units: 1, now: deps.now?.() });
  const settings = await getAdStudioSettings(ctx.organizationId, ctx.projectId);
  const input = await briefPromptInput(brief);
  // A picture described in Hebrew reaches the image model in English; the fingerprint keeps the words as written.
  const visualPrompt = await englishForModel(concept.visualPrompt, { ...ctx, llm: deps.llm, now: deps.now?.() });
  const prompt = buildImagePrompt({ ...concept, visualPrompt }, ctx.format, input);
  const record = await createAdStudioImage({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    conceptId: concept.id,
    format: ctx.format,
    kind: 'render',
    conceptFingerprint: imageConceptFingerprint(concept, ctx.format, input.language),
    prompt,
    provider: 'gemini',
    model: deps.images?.model ?? 'unconfigured',
    imageSize: settings.imageSize,
    actorId: ctx.actorId,
    now: deps.now?.(),
  });
  const subject = { headline: concept.headline, visualPrompt: concept.visualPrompt, language: input.language };
  const headline = concept.headline.trim();
  // A text-free picture with room kept for the headline, which is then set in code: the words are always exact.
  const fallback =
    headline && canOverlayHeadline(input.language)
      ? async (generator: AdStudioImageGenerator, fixes: readonly string[]) => {
          const cleanPrompt = buildImagePrompt({ ...concept, visualPrompt, headline: '' }, ctx.format, input, { headlineSpace: true });
          const clean = await generator.generate({ prompt: withFixes(cleanPrompt, fixes), aspectRatio: AD_STUDIO_IMAGE_ASPECT_RATIO[ctx.format], imageSize: settings.imageSize });
          return overlayHeadline({ image: clean, headline, format: ctx.format });
        }
      : undefined;
  return produceImage(
    ctx,
    deps,
    record,
    'image',
    settings.videoQa,
    subject,
    (generator, fixes) => generator.generate({ prompt: withFixes(prompt, fixes), aspectRatio: AD_STUDIO_IMAGE_ASPECT_RATIO[ctx.format], imageSize: settings.imageSize }),
    fallback,
  );
}

/**
 * Changes a ready image by an instruction ("warmer light", "move the headline to the top"): the
 * image model receives the image itself and the instruction, and the result is a new version whose
 * parent is the edited image. It keeps the concept fingerprint of its parent, so it counts as an
 * image of the same concept version.
 */
export async function editAdStudioImage(ctx: BriefContext & { imageId: string; instruction: string }, deps: AdStudioImageDeps): Promise<AdStudioImageModel> {
  await ensureOrm();
  const instruction = ctx.instruction.trim();
  if (!instruction || instruction.length > AD_STUDIO_IMAGE_INSTRUCTION_MAX) throw new AdStudioImageRequestError('invalid_instruction');
  const parent = await getAdStudioImage(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.imageId);
  if (parent.status !== 'ready' || !parent.gcs_path) throw new AdStudioImageRequestError('image_not_editable');
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'image_edit', units: 1, now: deps.now?.() });
  const [brief, settings] = await Promise.all([getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId), getAdStudioSettings(ctx.organizationId, ctx.projectId)]);
  const concept = (brief.image_concepts ?? []).find((candidate) => candidate.id === parent.concept_id);
  const bytes = await readAdStudioObject(deps.storage, parent.gcs_path, MAX_STORED_IMAGE_BYTES);
  // The person's words are kept on the image; the image model gets them in English.
  const modelInstruction = await englishForModel(instruction, { ...ctx, llm: deps.llm, now: deps.now?.() });
  const record = await createAdStudioImage({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    conceptId: parent.concept_id,
    format: parent.image_format,
    kind: 'edit',
    parentImageId: parent.id,
    instruction,
    conceptFingerprint: parent.concept_fingerprint,
    prompt: instruction,
    provider: 'gemini',
    model: deps.images?.model ?? 'unconfigured',
    imageSize: settings.imageSize,
    actorId: ctx.actorId,
    now: deps.now?.(),
  });
  // The edit may change the words on purpose, so the check looks for misspellings, not for the original headline.
  const subject = { headline: null, visualPrompt: `${concept?.visualPrompt ?? ''}\nEdited as asked: ${instruction}`.trim(), language: brief.language };
  return produceImage(ctx, deps, record, 'image_edit', settings.videoQa, subject, (generator, fixes) =>
    generator.edit({
      instruction: withFixes(modelInstruction, fixes),
      image: { bytes, mimeType: parent.mime_type ?? 'image/png' },
      aspectRatio: AD_STUDIO_IMAGE_ASPECT_RATIO[parent.image_format],
      imageSize: settings.imageSize,
    }),
  );
}

/**
 * How long an image may stay "generating" before it is given up. A render request takes at most a
 * few minutes (gemini-image's own timeout); one still generating long after that died with its
 * request (a deploy, a crash) and would otherwise spin forever and block its slot.
 */
export const IMAGE_TIMEOUT_MS = 10 * 60_000;

export async function listBriefImages(ctx: Omit<BriefContext, 'actorId'> & { now?: Date }): Promise<AdStudioImageView[]> {
  await ensureOrm();
  const now = ctx.now ?? new Date();
  const images = await listAdStudioImages(ctx.organizationId, ctx.projectId, ctx.briefId);
  const swept = await Promise.all(
    images.map((image) =>
      image.status === 'generating' && now.getTime() - new Date(image.requested_on).getTime() > IMAGE_TIMEOUT_MS
        ? markAdStudioImageFailed(image, { code: 'timed_out', message: `Still generating after ${IMAGE_TIMEOUT_MS / 60_000} minutes; given up.`, now })
        : image,
    ),
  );
  return swept.map(toAdStudioImageView);
}

export async function selectBriefImage(ctx: Omit<BriefContext, 'actorId'> & { imageId: string }): Promise<AdStudioImageView> {
  await ensureOrm();
  return toAdStudioImageView(await selectAdStudioImage(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.imageId));
}

/** Reads a ready image's bytes (for the media route, MCP and exports). */
export async function readBriefImage(ctx: Omit<BriefContext, 'actorId'> & { imageId: string }, storage: AdStudioMediaStorage = resolveAdStudioMediaStorage()): Promise<{ bytes: Buffer; mimeType: string; image: AdStudioImageModel }> {
  await ensureOrm();
  const image = await getAdStudioImage(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.imageId);
  if (image.status !== 'ready' || !image.gcs_path) throw new AdStudioImageRequestError('image_not_ready');
  return { bytes: await readAdStudioObject(storage, image.gcs_path, MAX_STORED_IMAGE_BYTES), mimeType: image.mime_type ?? 'image/png', image };
}

/** Exports a ready image to Meta's ad image library or a Google Ads image asset. */
export async function exportBriefImage(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  imageId: string;
  destination: AdStudioImageExportDestination;
  title: string;
  actorId: string;
  actorType?: 'user' | 'api_key';
  storage?: AdStudioMediaStorage;
}): Promise<AdStudioExportModel> {
  const { bytes } = await readBriefImage(params, params.storage ?? resolveAdStudioMediaStorage());
  return exportAdStudioImage({
    organizationId: params.organizationId,
    projectId: params.projectId,
    briefId: params.briefId,
    imageId: params.imageId,
    destination: params.destination,
    title: params.title,
    readImage: async () => new Uint8Array(bytes),
    kms: getServerKmsProvider(),
    actorId: params.actorId,
    actorType: params.actorType,
  });
}
