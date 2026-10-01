import {
  AD_STUDIO_MAX_REFERENCE_BYTES,
  sniffReferenceMimeType,
  type AdStudioPromptReference,
  type AdStudioReferenceUse,
  type AdStudioScene,
} from '@growthos/shared';
import {
  assertAdStudioQuota,
  createAdStudioReference,
  deleteAdStudioReference,
  getAdStudioReference,
  listAdStudioReferences,
  markAdStudioReferenceFailed,
  markAdStudioReferenceReady,
  recordAdStudioUsage,
  type AdStudioReferenceModel,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { AdStudioProviderError } from './llm';
import { adStudioBriefMediaPrefix, readAdStudioObject, resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';
import type { AdStudioImageAspectRatio, AdStudioImageGenerator } from './gemini-image';
import type { OmniImageInput } from './omni';
import type { AdStudioReferenceView } from './view';

/**
 * Reference images for video scenes (KAN-243): the ad's library of real app screenshots and AI
 * illustrations, and what a scene render sends to the video model with its prompt.
 */

/** Why a reference request cannot go ahead, as a code the UI translates. */
export type AdStudioReferenceRequestCode = 'unsupported_image' | 'image_too_large' | 'illustration_not_configured' | 'reference_not_ready';

export class AdStudioReferenceRequestError extends Error {
  constructor(public readonly code: AdStudioReferenceRequestCode) {
    super(`Ad Studio reference request refused: ${code}`);
    this.name = 'AdStudioReferenceRequestError';
  }
}

interface BriefContext {
  organizationId: string;
  projectId: string;
  briefId: string;
  actorId: string;
}

interface ReferenceText {
  label: string;
  description: string;
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

export function adStudioReferenceObjectPath(ref: Omit<BriefContext, 'actorId'> & { referenceId: string; mimeType: string }): string {
  return `${adStudioBriefMediaPrefix(ref)}references/${ref.referenceId}.${EXTENSIONS[ref.mimeType] ?? 'png'}`;
}

export function toAdStudioReferenceView(reference: AdStudioReferenceModel): AdStudioReferenceView {
  return {
    id: reference.id,
    source: reference.source,
    label: reference.label,
    description: reference.description,
    status: reference.status,
    prompt: reference.prompt ?? null,
    mimeType: reference.mime_type ?? null,
    byteSize: reference.byte_size ?? null,
    failureCode: reference.failure_code ?? null,
    createdOn: reference.created_on,
  };
}

/** Checks the bytes are a PNG or JPEG within the size limit; returns the real type. */
function checkedImage(bytes: Buffer): 'image/png' | 'image/jpeg' {
  if (bytes.length > AD_STUDIO_MAX_REFERENCE_BYTES) throw new AdStudioReferenceRequestError('image_too_large');
  const mimeType = sniffReferenceMimeType(bytes);
  if (!mimeType) throw new AdStudioReferenceRequestError('unsupported_image');
  return mimeType;
}

async function store(reference: AdStudioReferenceModel, ctx: Omit<BriefContext, 'actorId'>, bytes: Buffer, storage: AdStudioMediaStorage, now?: Date): Promise<AdStudioReferenceModel> {
  const mimeType = checkedImage(bytes);
  const gcsPath = adStudioReferenceObjectPath({ ...ctx, referenceId: reference.id, mimeType });
  await storage.upload(gcsPath, bytes, mimeType);
  return markAdStudioReferenceReady(reference, { gcsPath, mimeType, byteSize: bytes.length, now });
}

/** Stores an image a person (or an agent) uploaded: a real app screenshot, a logo, a product photo. */
export async function addUploadedReference(
  ctx: BriefContext & ReferenceText & { bytes: Buffer; now?: Date },
  storage: AdStudioMediaStorage = resolveAdStudioMediaStorage(),
): Promise<AdStudioReferenceModel> {
  checkedImage(ctx.bytes);
  await ensureOrm();
  const reference = await createAdStudioReference({ ...ctx, source: 'upload' });
  return store(reference, ctx, ctx.bytes, storage, ctx.now);
}

// ---- AI illustration --------------------------------------------------------------------------

/** The image model prompt for an illustration a scene will hand to the video model. */
export function buildIllustrationPrompt(request: string): string {
  return [
    request.replace(/\s+/g, ' ').trim(),
    'A clean, polished, high-resolution image for a video ad, sharp enough to be shown full screen.',
  ].join('\n');
}

/**
 * Draws an illustration with the image model and stores it as a reference image (kind
 * `reference_image`, counted toward the daily image limit). A failed drawing stays in the library as failed.
 */
export async function drawReferenceIllustration(
  ctx: BriefContext & ReferenceText & { prompt: string; aspectRatio: AdStudioImageAspectRatio; now?: Date },
  deps: { images: AdStudioImageGenerator | null; storage?: AdStudioMediaStorage },
): Promise<AdStudioReferenceModel> {
  if (!deps.images) throw new AdStudioReferenceRequestError('illustration_not_configured');
  await ensureOrm();
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'reference_image', units: 1, now: ctx.now });
  const generator = deps.images;
  const reference = await createAdStudioReference({ ...ctx, source: 'illustration', prompt: ctx.prompt.trim(), model: generator.model });
  const usage = { organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'reference_image' as const, provider: generator.provider, model: generator.model, units: 1, briefId: ctx.briefId, actorId: ctx.actorId, now: ctx.now };
  try {
    const image = await generator.generate({ prompt: buildIllustrationPrompt(ctx.prompt), aspectRatio: ctx.aspectRatio });
    await recordAdStudioUsage({ ...usage, outcome: 'succeeded' });
    return await store(reference, ctx, image.bytes, deps.storage ?? resolveAdStudioMediaStorage(), ctx.now);
  } catch (error) {
    const code = error instanceof AdStudioProviderError || error instanceof AdStudioReferenceRequestError ? error.code : 'provider_error';
    if (!(error instanceof AdStudioReferenceRequestError)) await recordAdStudioUsage({ ...usage, outcome: 'failed', failureReason: code });
    await markAdStudioReferenceFailed(reference, { code, message: error instanceof Error ? error.message : String(error), now: ctx.now });
    throw error;
  }
}

// ---- Library ----------------------------------------------------------------------------------

export async function listBriefReferences(ctx: Omit<BriefContext, 'actorId'>): Promise<AdStudioReferenceView[]> {
  await ensureOrm();
  return (await listAdStudioReferences(ctx.organizationId, ctx.projectId, ctx.briefId)).map(toAdStudioReferenceView);
}

export async function readBriefReference(
  ctx: Omit<BriefContext, 'actorId'> & { referenceId: string },
  storage: AdStudioMediaStorage = resolveAdStudioMediaStorage(),
): Promise<{ bytes: Buffer; mimeType: string; reference: AdStudioReferenceModel }> {
  await ensureOrm();
  const reference = await getAdStudioReference(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.referenceId);
  if (reference.status !== 'ready' || !reference.gcs_path) throw new AdStudioReferenceRequestError('reference_not_ready');
  const bytes = await readAdStudioObject(storage, reference.gcs_path, AD_STUDIO_MAX_REFERENCE_BYTES);
  return { bytes, mimeType: reference.mime_type ?? 'image/png', reference };
}

/** Deletes an image, detaches it from every scene, and removes its stored file. */
export async function removeBriefReference(ctx: Omit<BriefContext, 'actorId'> & { referenceId: string }, storage: AdStudioMediaStorage = resolveAdStudioMediaStorage()): Promise<void> {
  await ensureOrm();
  const { gcsPath } = await deleteAdStudioReference(ctx.organizationId, ctx.projectId, ctx.briefId, ctx.referenceId);
  if (gcsPath) await storage.deletePrefix(gcsPath);
}

/** A scene's attached images as the render and the quality check use them: in order, ready ones only. */
export interface AdStudioSceneReferenceInput {
  prompt: AdStudioPromptReference;
  image: OmniImageInput;
  use: AdStudioReferenceUse;
  label: string;
}

export async function loadSceneReferences(
  ctx: Omit<BriefContext, 'actorId'>,
  scene: Pick<AdStudioScene, 'references'>,
  storage: AdStudioMediaStorage,
): Promise<AdStudioSceneReferenceInput[]> {
  const attached = scene.references ?? [];
  if (attached.length === 0) return [];
  const library = new Map((await listAdStudioReferences(ctx.organizationId, ctx.projectId, ctx.briefId)).map((reference) => [reference.id, reference]));
  const inputs: AdStudioSceneReferenceInput[] = [];
  for (const entry of attached) {
    const reference = library.get(entry.imageId);
    if (!reference || reference.status !== 'ready' || !reference.gcs_path) continue;
    const data = await readAdStudioObject(storage, reference.gcs_path, AD_STUDIO_MAX_REFERENCE_BYTES);
    inputs.push({ prompt: { use: entry.use, description: reference.description }, image: { mimeType: reference.mime_type ?? 'image/png', data }, use: entry.use, label: reference.label });
  }
  return inputs;
}
