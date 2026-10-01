import {
  AD_STUDIO_MAX_REFERENCES,
  AD_STUDIO_REFERENCE_DESCRIPTION_MAX,
  AD_STUDIO_REFERENCE_LABEL_MAX,
  type AdStudioReferenceSource,
  type AdStudioScene,
  type AdStudioSceneIssue,
} from '@growthos/shared';
import { AdStudioReferenceModel } from '../models/ad-studio-reference.model';
import { AdStudioBriefModel } from '../models/ad-studio.model';

/**
 * Ad Studio reference image records (KAN-243). The engine (`@growthos/ad-studio`) stores the bytes
 * and draws illustrations; these functions keep the library: what each image is,
 * whether it is ready, and which scenes may attach it.
 */

export class AdStudioReferenceNotFoundError extends Error {
  constructor() {
    super('Ad Studio reference image not found.');
    this.name = 'AdStudioReferenceNotFoundError';
  }
}

export type AdStudioReferenceInvalidCode = 'label_required' | 'label_too_long' | 'description_too_long' | 'library_full';

export class AdStudioReferenceInvalidError extends Error {
  constructor(public readonly code: AdStudioReferenceInvalidCode) {
    super(`Ad Studio reference image refused: ${code}`);
    this.name = 'AdStudioReferenceInvalidError';
  }
}

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

/** Trimmed label and description, or the rule they break. */
function checkedText(label: string, description: string): { label: string; description: string } {
  const cleanLabel = label.replace(/\s+/g, ' ').trim();
  const cleanDescription = description.replace(/\s+/g, ' ').trim();
  if (!cleanLabel) throw new AdStudioReferenceInvalidError('label_required');
  if (cleanLabel.length > AD_STUDIO_REFERENCE_LABEL_MAX) throw new AdStudioReferenceInvalidError('label_too_long');
  if (cleanDescription.length > AD_STUDIO_REFERENCE_DESCRIPTION_MAX) throw new AdStudioReferenceInvalidError('description_too_long');
  return { label: cleanLabel, description: cleanDescription };
}

/** Every reference image of a brief, newest first. */
export async function listAdStudioReferences(organizationId: string, projectId: string, briefId: string): Promise<AdStudioReferenceModel[]> {
  const rows = await AdStudioReferenceModel.initPath(pathParams(organizationId, projectId)).where('brief_id', '==', briefId).get();
  return rows.sort((a, b) => b.created_on.localeCompare(a.created_on));
}

export async function getAdStudioReference(organizationId: string, projectId: string, briefId: string, referenceId: string): Promise<AdStudioReferenceModel> {
  const reference = await AdStudioReferenceModel.init(referenceId, pathParams(organizationId, projectId));
  if (!reference || reference.brief_id !== briefId || reference.organization_id !== organizationId || reference.project_id !== projectId) throw new AdStudioReferenceNotFoundError();
  return reference;
}

/** Records an image about to be stored or drawn. Refused once the library is full. */
export async function createAdStudioReference(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  source: AdStudioReferenceSource;
  label: string;
  description: string;
  prompt?: string | null;
  model?: string | null;
  actorId: string;
  now?: Date;
}): Promise<AdStudioReferenceModel> {
  const text = checkedText(params.label, params.description);
  const existing = await listAdStudioReferences(params.organizationId, params.projectId, params.briefId);
  if (existing.length >= AD_STUDIO_MAX_REFERENCES) throw new AdStudioReferenceInvalidError('library_full');
  const reference = new AdStudioReferenceModel();
  reference.organization_id = params.organizationId;
  reference.project_id = params.projectId;
  reference.brief_id = params.briefId;
  reference.source = params.source;
  reference.label = text.label;
  reference.description = text.description;
  reference.status = 'generating';
  reference.prompt = params.prompt ?? null;
  reference.model = params.model ?? null;
  reference.created_by = params.actorId;
  reference.created_on = nowIso(params.now);
  reference.setPathParams(pathParams(params.organizationId, params.projectId));
  await reference.save();
  return reference;
}

export async function markAdStudioReferenceReady(
  reference: AdStudioReferenceModel,
  params: { gcsPath: string; mimeType: string; byteSize: number; now?: Date },
): Promise<AdStudioReferenceModel> {
  reference.status = 'ready';
  reference.gcs_path = params.gcsPath;
  reference.mime_type = params.mimeType;
  reference.byte_size = params.byteSize;
  reference.completed_on = nowIso(params.now);
  await reference.save();
  return reference;
}

export async function markAdStudioReferenceFailed(reference: AdStudioReferenceModel, params: { code: string; message: string; now?: Date }): Promise<AdStudioReferenceModel> {
  reference.status = 'failed';
  reference.failure_code = params.code;
  reference.failure_message = params.message.slice(0, 500);
  reference.completed_on = nowIso(params.now);
  await reference.save();
  return reference;
}

/** Renames an image or changes what it says it shows (scenes using it see the change on their next render). */
export async function updateAdStudioReference(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  referenceId: string;
  label: string;
  description: string;
}): Promise<AdStudioReferenceModel> {
  const reference = await getAdStudioReference(params.organizationId, params.projectId, params.briefId, params.referenceId);
  const text = checkedText(params.label, params.description);
  reference.label = text.label;
  reference.description = text.description;
  await reference.save();
  return reference;
}

/**
 * Deletes one image and detaches it from every scene of the brief, so no scene points at a missing
 * image. Returns the stored file's path for the caller to remove.
 */
export async function deleteAdStudioReference(organizationId: string, projectId: string, briefId: string, referenceId: string): Promise<{ gcsPath: string | null }> {
  const reference = await getAdStudioReference(organizationId, projectId, briefId, referenceId);
  const brief = await AdStudioBriefModel.init(briefId, pathParams(organizationId, projectId));
  if (brief && (brief.scenes ?? []).some((scene) => scene.references?.some((entry) => entry.imageId === referenceId))) {
    brief.scenes = brief.scenes.map((scene) => {
      const { references, ...rest } = scene;
      const kept = (references ?? []).filter((entry) => entry.imageId !== referenceId);
      return kept.length ? { ...rest, references: kept } : rest;
    });
    await brief.save();
  }
  const gcsPath = reference.gcs_path ?? null;
  await reference.remove();
  return { gcsPath };
}

/** Removes every reference record of a brief (the caller removes the stored files). */
export async function deleteAdStudioBriefReferences(organizationId: string, projectId: string, briefId: string): Promise<number> {
  const references = await listAdStudioReferences(organizationId, projectId, briefId);
  await Promise.all(references.map((reference) => reference.remove()));
  return references.length;
}

/** The scenes that attach an image which is not a ready image of this brief's library. */
export async function unknownSceneReferences(organizationId: string, projectId: string, briefId: string, scenes: readonly AdStudioScene[]): Promise<AdStudioSceneIssue[]> {
  if (!scenes.some((scene) => scene.references?.length)) return [];
  const ready = new Set((await listAdStudioReferences(organizationId, projectId, briefId)).filter((reference) => reference.status === 'ready').map((reference) => reference.id));
  return scenes.flatMap((scene, index) => (scene.references?.some((entry) => !ready.has(entry.imageId)) ? [{ code: 'unknown_reference' as const, scene: index + 1 }] : []));
}
