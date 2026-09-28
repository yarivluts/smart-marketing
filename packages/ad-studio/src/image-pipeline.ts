import { z } from 'zod/v4';
import {
  AD_STUDIO_IMAGE_ASPECT_RATIO,
  AD_STUDIO_IMAGE_INSTRUCTION_MAX,
  buildImageConceptsPrompt,
  buildImagePrompt,
  fitAdStudioImageConcepts,
  imageConceptFingerprint,
  isAdStudioImageFormat,
  planToScriptContext,
  type AdStudioImageFormat,
} from '@growthos/shared';
import {
  adStudioBriefInput,
  assertAdStudioQuota,
  createAdStudioImage,
  exportAdStudioImage,
  getAdStudioBrief,
  getAdStudioImage,
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
} from '@growthos/firebase-orm-models';
import { ensureOrm, getServerKmsProvider } from './runtime';
import { AdStudioProviderError } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';
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
  now?: () => Date;
}

export function resolveAdStudioImageDeps(env: NodeJS.ProcessEnv = process.env): AdStudioImageDeps {
  return { images: resolveAdStudioImageGenerator(env), storage: resolveAdStudioMediaStorage(env) };
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
  };
}

const GeneratedConceptsSchema = z.object({
  concepts: z.array(
    z.object({
      visualPrompt: z.string().describe('What the picture shows, in English, for an image model. No text in the picture here.'),
      headline: z.string().describe('The only text drawn into the image, in the ad language, at most 40 characters, or empty.'),
      formats: z.array(z.string()).describe('Placements this idea suits: square, portrait, story, landscape.'),
    }),
  ),
});

/**
 * Writes image ad ideas for a brief with the text model (building on its plan and video script when
 * present) and saves them, replacing the earlier list. `formats` narrows the placements to those the
 * person asked for; the model's own choices are kept within them.
 */
export async function generateAdStudioImageConcepts(ctx: AdStudioCallContext & { briefId: string; formats?: readonly AdStudioImageFormat[] }): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const prompt = buildImageConceptsPrompt(adStudioBriefInput(brief), { ...context, scenes: brief.scenes });
  const generated = await meteredCall(ctx, 'image_concepts', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: GeneratedConceptsSchema }));
  const allowed = ctx.formats?.length ? ctx.formats.filter(isAdStudioImageFormat) : null;
  const concepts = fitAdStudioImageConcepts(
    generated.concepts.map((concept) => ({ ...concept, formats: allowed ? concept.formats.filter((format) => allowed.includes(format as AdStudioImageFormat)) : concept.formats })),
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

/** Runs one image call inside the daily image limit, stores the result and records the usage either way. */
async function produceImage(
  ctx: BriefContext,
  deps: AdStudioImageDeps,
  record: AdStudioImageModel,
  kind: 'image' | 'image_edit',
  call: (generator: AdStudioImageGenerator) => Promise<AdStudioGeneratedImage>,
): Promise<AdStudioImageModel> {
  const now = deps.now ?? (() => new Date());
  const usage = { organizationId: ctx.organizationId, projectId: ctx.projectId, kind, provider: 'gemini', model: record.model, units: 1, briefId: ctx.briefId, actorId: ctx.actorId };
  try {
    const generator = deps.images;
    if (!generator) throw new AdStudioProviderError('not_configured', 'No image model is configured.');
    const image = await call(generator);
    const objectPath = adStudioImageObjectPath({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: ctx.briefId, imageId: record.id, mimeType: image.mimeType });
    await deps.storage.upload(objectPath, image.bytes, image.mimeType);
    await recordAdStudioUsage({ ...usage, outcome: 'succeeded', now: now() });
    return await markAdStudioImageReady(record, { gcsPath: objectPath, mimeType: image.mimeType, byteSize: image.bytes.length, now: now() });
  } catch (error) {
    const code = error instanceof AdStudioProviderError ? error.code : 'storage_error';
    const message = error instanceof Error ? error.message : String(error);
    if (code !== 'not_configured') await recordAdStudioUsage({ ...usage, outcome: 'failed', failureReason: code, now: now() });
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
  const input = adStudioBriefInput(brief);
  const prompt = buildImagePrompt(concept, ctx.format, input);
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
    actorId: ctx.actorId,
    now: deps.now?.(),
  });
  return produceImage(ctx, deps, record, 'image', (generator) => generator.generate({ prompt, aspectRatio: AD_STUDIO_IMAGE_ASPECT_RATIO[ctx.format] }));
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
  const bytes = await readAdStudioObject(deps.storage, parent.gcs_path, MAX_STORED_IMAGE_BYTES);
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
    actorId: ctx.actorId,
    now: deps.now?.(),
  });
  return produceImage(ctx, deps, record, 'image_edit', (generator) =>
    generator.edit({ instruction, image: { bytes, mimeType: parent.mime_type ?? 'image/png' }, aspectRatio: AD_STUDIO_IMAGE_ASPECT_RATIO[parent.image_format] }),
  );
}

export async function listBriefImages(ctx: Omit<BriefContext, 'actorId'>): Promise<AdStudioImageView[]> {
  await ensureOrm();
  return (await listAdStudioImages(ctx.organizationId, ctx.projectId, ctx.briefId)).map(toAdStudioImageView);
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
