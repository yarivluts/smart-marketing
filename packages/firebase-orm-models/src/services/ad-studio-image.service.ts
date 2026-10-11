import type { AdStudioImageFormat } from '@growthos/shared';
import { AdStudioImageModel, type AdStudioImageKind } from '../models/ad-studio-image.model';

/**
 * Ad Studio image records (image ads next to the video). The engine (`@growthos/ad-studio`) calls
 * the model and stores the bytes; these functions keep the records: every render and edit is a new
 * version, and exactly one ready version per concept and placement can be `selected`.
 */

export class AdStudioImageNotFoundError extends Error {
  constructor() {
    super('Ad Studio image not found.');
    this.name = 'AdStudioImageNotFoundError';
  }
}

export class AdStudioImageNotReadyError extends Error {
  constructor() {
    super('That image is not ready yet.');
    this.name = 'AdStudioImageNotReadyError';
  }
}

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

/** Every image of a brief, newest first. */
export async function listAdStudioImages(organizationId: string, projectId: string, briefId: string): Promise<AdStudioImageModel[]> {
  const rows = await AdStudioImageModel.initPath(pathParams(organizationId, projectId)).where('brief_id', '==', briefId).get();
  return rows.sort((a, b) => b.requested_on.localeCompare(a.requested_on));
}

export async function getAdStudioImage(organizationId: string, projectId: string, briefId: string, imageId: string): Promise<AdStudioImageModel> {
  const image = await AdStudioImageModel.init(imageId, pathParams(organizationId, projectId));
  if (!image || image.brief_id !== briefId || image.organization_id !== organizationId || image.project_id !== projectId) throw new AdStudioImageNotFoundError();
  return image;
}

/** Records a render or edit that is about to be generated; its version follows the concept and placement's latest. */
export async function createAdStudioImage(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  conceptId: string;
  format: AdStudioImageFormat;
  kind: AdStudioImageKind;
  parentImageId?: string | null;
  instruction?: string | null;
  conceptFingerprint: string;
  prompt: string;
  provider: string;
  model: string;
  actorId: string;
  now?: Date;
}): Promise<AdStudioImageModel> {
  const existing = (await listAdStudioImages(params.organizationId, params.projectId, params.briefId)).filter(
    (image) => image.concept_id === params.conceptId && image.image_format === params.format,
  );
  const image = new AdStudioImageModel();
  image.organization_id = params.organizationId;
  image.project_id = params.projectId;
  image.brief_id = params.briefId;
  image.concept_id = params.conceptId;
  image.image_format = params.format;
  image.kind = params.kind;
  image.version = existing.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  image.parent_image_id = params.parentImageId ?? null;
  image.instruction = params.instruction ?? null;
  image.concept_fingerprint = params.conceptFingerprint;
  image.prompt = params.prompt;
  image.status = 'generating';
  image.selected = false;
  image.provider = params.provider;
  image.model = params.model;
  image.requested_by = params.actorId;
  image.requested_on = (params.now ?? new Date()).toISOString();
  image.setPathParams(pathParams(params.organizationId, params.projectId));
  await image.save();
  return image;
}

/**
 * Stores the finished image and makes it the selected version for its concept and placement - the
 * newest good image is what a person expects to use; they can pick an older version afterwards.
 */
export async function markAdStudioImageReady(
  image: AdStudioImageModel,
  params: { gcsPath: string; mimeType: string; byteSize: number; now?: Date },
): Promise<AdStudioImageModel> {
  image.status = 'ready';
  image.gcs_path = params.gcsPath;
  image.mime_type = params.mimeType;
  image.byte_size = params.byteSize;
  image.completed_on = (params.now ?? new Date()).toISOString();
  await image.save();
  return selectAdStudioImage(image.organization_id, image.project_id, image.brief_id, image.id);
}

export async function markAdStudioImageFailed(image: AdStudioImageModel, params: { code: string; message: string; now?: Date }): Promise<AdStudioImageModel> {
  image.status = 'failed';
  image.failure_code = params.code;
  image.failure_message = params.message.slice(0, 500);
  image.completed_on = (params.now ?? new Date()).toISOString();
  await image.save();
  return image;
}

/** Makes a ready image the chosen version for its concept and placement (and unselects the others). */
export async function selectAdStudioImage(organizationId: string, projectId: string, briefId: string, imageId: string): Promise<AdStudioImageModel> {
  const image = await getAdStudioImage(organizationId, projectId, briefId, imageId);
  if (image.status !== 'ready') throw new AdStudioImageNotReadyError();
  const siblings = (await listAdStudioImages(organizationId, projectId, briefId)).filter(
    (row) => row.concept_id === image.concept_id && row.image_format === image.image_format && row.id !== image.id && row.selected,
  );
  await Promise.all(
    siblings.map(async (row) => {
      row.selected = false;
      await row.save();
    }),
  );
  if (!image.selected) {
    image.selected = true;
    await image.save();
  }
  return image;
}

/** Removes every image record of a brief (the caller removes the stored files). */
export async function deleteAdStudioBriefImages(organizationId: string, projectId: string, briefId: string): Promise<number> {
  const images = await listAdStudioImages(organizationId, projectId, briefId);
  await Promise.all(images.map((image) => image.remove()));
  return images.length;
}
