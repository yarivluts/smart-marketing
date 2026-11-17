import {
  AD_STUDIO_GALLERY_DESCRIPTION_MAX,
  AD_STUDIO_GALLERY_LABEL_MAX,
  AD_STUDIO_MAX_GALLERY_ASSETS,
  type AdStudioGalleryAssetKind,
  type AdStudioGallerySource,
} from '@growthos/shared';
import { AdStudioGalleryAssetModel } from '../models/ad-studio-gallery.model';

/**
 * Project-level Ad Studio gallery asset records. The bytes live in the private GCS bucket (handled
 * by `@growthos/ad-studio`); these functions enforce limits, validation, tenant binding and sorting.
 */

export class AdStudioGalleryAssetNotFoundError extends Error {
  constructor() {
    super('Ad Studio gallery asset not found.');
    this.name = 'AdStudioGalleryAssetNotFoundError';
  }
}

export type AdStudioGalleryInvalidCode = 'label_required' | 'label_too_long' | 'description_too_long' | 'gallery_full';

export class AdStudioGalleryInvalidError extends Error {
  constructor(public readonly code: AdStudioGalleryInvalidCode) {
    super(`Ad Studio gallery asset refused: ${code}`);
    this.name = 'AdStudioGalleryInvalidError';
  }
}

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function checkedText(label: string, description: string): { label: string; description: string } {
  const cleanLabel = label.replace(/\s+/g, ' ').trim();
  const cleanDescription = description.replace(/\s+/g, ' ').trim();
  if (!cleanLabel) throw new AdStudioGalleryInvalidError('label_required');
  if (cleanLabel.length > AD_STUDIO_GALLERY_LABEL_MAX) throw new AdStudioGalleryInvalidError('label_too_long');
  if (cleanDescription.length > AD_STUDIO_GALLERY_DESCRIPTION_MAX) throw new AdStudioGalleryInvalidError('description_too_long');
  return { label: cleanLabel, description: cleanDescription };
}

/** Every uploaded/saved gallery item in a project, newest first. */
export async function listAdStudioGalleryAssets(organizationId: string, projectId: string): Promise<AdStudioGalleryAssetModel[]> {
  const rows = await AdStudioGalleryAssetModel.initPath(pathParams(organizationId, projectId)).query().get();
  return rows.filter((row) => row.project_id === projectId).sort((a, b) => b.created_on.localeCompare(a.created_on));
}

export async function getAdStudioGalleryAsset(organizationId: string, projectId: string, assetId: string): Promise<AdStudioGalleryAssetModel> {
  const asset = await AdStudioGalleryAssetModel.init(assetId, pathParams(organizationId, projectId));
  if (!asset || asset.organization_id !== organizationId || asset.project_id !== projectId) {
    throw new AdStudioGalleryAssetNotFoundError();
  }
  return asset;
}

export async function createAdStudioGalleryAsset(params: {
  organizationId: string;
  projectId: string;
  id?: string;
  kind: AdStudioGalleryAssetKind;
  source: AdStudioGallerySource;
  label: string;
  description: string;
  gcsPath: string;
  mimeType: string;
  byteSize: number;
  durationSeconds?: number | null;
  actorId: string;
  now?: Date;
}): Promise<AdStudioGalleryAssetModel> {
  const text = checkedText(params.label, params.description);
  const existing = await listAdStudioGalleryAssets(params.organizationId, params.projectId);
  if (existing.length >= AD_STUDIO_MAX_GALLERY_ASSETS) throw new AdStudioGalleryInvalidError('gallery_full');

  const asset = new AdStudioGalleryAssetModel();
  asset.organization_id = params.organizationId;
  asset.project_id = params.projectId;
  asset.kind = params.kind;
  asset.source = params.source;
  asset.label = text.label;
  asset.description = text.description;
  asset.gcs_path = params.gcsPath;
  asset.mime_type = params.mimeType;
  asset.byte_size = params.byteSize;
  asset.duration_seconds = params.durationSeconds ?? null;
  asset.created_by = params.actorId;
  asset.created_on = nowIso(params.now);
  asset.setPathParams(pathParams(params.organizationId, params.projectId));
  await (params.id ? asset.save(params.id) : asset.save());
  return asset;
}

export async function updateAdStudioGalleryAsset(params: {
  organizationId: string;
  projectId: string;
  assetId: string;
  label?: string;
  description?: string;
}): Promise<AdStudioGalleryAssetModel> {
  const asset = await getAdStudioGalleryAsset(params.organizationId, params.projectId, params.assetId);
  const text = checkedText(params.label ?? asset.label, params.description ?? asset.description);
  asset.label = text.label;
  asset.description = text.description;
  await asset.save();
  return asset;
}

export async function deleteAdStudioGalleryAsset(
  organizationId: string,
  projectId: string,
  assetId: string,
): Promise<{ gcsPath: string }> {
  const asset = await getAdStudioGalleryAsset(organizationId, projectId, assetId);
  const gcsPath = asset.gcs_path;
  await asset.remove();
  return { gcsPath };
}
