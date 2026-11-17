/**
 * Project-level Ad Studio media gallery: images and video clips uploaded from the computer or
 * extracted from AI-guided product walkthroughs, reusable across video scenes and image ads.
 */

export const AD_STUDIO_GALLERY_ASSET_KINDS = ['image', 'video'] as const;
export type AdStudioGalleryAssetKind = (typeof AD_STUDIO_GALLERY_ASSET_KINDS)[number];

export const AD_STUDIO_GALLERY_SOURCES = ['upload', 'walkthrough', 'brief_reference', 'brief_image', 'brief_clip'] as const;
export type AdStudioGallerySource = (typeof AD_STUDIO_GALLERY_SOURCES)[number];

export const AD_STUDIO_GALLERY_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export type AdStudioGalleryVideoMimeType = (typeof AD_STUDIO_GALLERY_VIDEO_MIME_TYPES)[number];

/** Normalized image stored in the gallery (matches Ad Studio reference limit). */
export const AD_STUDIO_MAX_GALLERY_IMAGE_BYTES = 4 * 1024 * 1024;
/** Raw computer image upload cap before server-side resize/re-encode. */
export const AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const AD_STUDIO_MAX_GALLERY_VIDEO_BYTES = 50 * 1024 * 1024;
export const AD_STUDIO_MAX_GALLERY_ASSETS = 60;
export const AD_STUDIO_GALLERY_LABEL_MAX = 80;
export const AD_STUDIO_GALLERY_DESCRIPTION_MAX = 300;

export function isAdStudioGalleryAssetKind(value: unknown): value is AdStudioGalleryAssetKind {
  return typeof value === 'string' && (AD_STUDIO_GALLERY_ASSET_KINDS as readonly string[]).includes(value);
}

/**
 * Identifies MP4, MOV (QuickTime), or WebM video containers from leading magic bytes; declared Content-Type
 * or file extensions are never trusted on their own.
 */
export function sniffVideoContainer(bytes: Uint8Array): AdStudioGalleryVideoMimeType | null {
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    // ISO BMFF: bytes 8..11 hold major_brand ("qt  " for QuickTime MOV, otherwise MP4/M4V/ISOM).
    const isQuickTime = bytes[8] === 0x71 && bytes[9] === 0x74 && bytes[10] === 0x20 && bytes[11] === 0x20;
    return isQuickTime ? 'video/quicktime' : 'video/mp4';
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }
  return null;
}

/** Checks RIFF....WEBP header bytes for WebP image uploads prior to server normalization. */
export function isWebpBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export type AdStudioGallerySourceRef =
  | { type: 'gallery'; assetId: string }
  | { type: 'demo_segment'; recordingId: string; segmentId: string }
  | { type: 'brief_reference'; briefId: string; referenceId: string }
  | { type: 'brief_image'; briefId: string; imageId: string }
  | { type: 'brief_clip'; briefId: string; clipId: string };

export interface AdStudioGalleryItemView {
  id: string;
  assetId: string | null;
  kind: AdStudioGalleryAssetKind;
  source: AdStudioGallerySource;
  label: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
  durationSeconds: number | null;
  createdOn: string;
  deletable: boolean;
  sourceRef: AdStudioGallerySourceRef;
}

function nonEmptyId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

/** Parses an untrusted `gallerySource` JSON object; returns null if malformed or missing required IDs. */
export function parseGallerySourceRef(raw: unknown): AdStudioGallerySourceRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  switch (record.type) {
    case 'gallery': {
      const assetId = nonEmptyId(record.assetId);
      return assetId ? { type: 'gallery', assetId } : null;
    }
    case 'demo_segment': {
      const recordingId = nonEmptyId(record.recordingId);
      const segmentId = nonEmptyId(record.segmentId);
      return recordingId && segmentId ? { type: 'demo_segment', recordingId, segmentId } : null;
    }
    case 'brief_reference': {
      const briefId = nonEmptyId(record.briefId);
      const referenceId = nonEmptyId(record.referenceId);
      return briefId && referenceId ? { type: 'brief_reference', briefId, referenceId } : null;
    }
    case 'brief_image': {
      const briefId = nonEmptyId(record.briefId);
      const imageId = nonEmptyId(record.imageId);
      return briefId && imageId ? { type: 'brief_image', briefId, imageId } : null;
    }
    case 'brief_clip': {
      const briefId = nonEmptyId(record.briefId);
      const clipId = nonEmptyId(record.clipId);
      return briefId && clipId ? { type: 'brief_clip', briefId, clipId } : null;
    }
    default:
      return null;
  }
}

/** Extracts a short default label from an uploaded filename without its extension. */
export function galleryLabelFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AD_STUDIO_GALLERY_LABEL_MAX);
}
