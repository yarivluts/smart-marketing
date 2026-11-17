import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AD_STUDIO_GALLERY_DESCRIPTION_MAX,
  AD_STUDIO_GALLERY_LABEL_MAX,
  AD_STUDIO_MAX_GALLERY_IMAGE_BYTES,
  AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  AD_STUDIO_MAX_GALLERY_VIDEO_BYTES,
  galleryLabelFromFileName,
  isWebpBytes,
  sniffReferenceMimeType,
  sniffVideoContainer,
  type AdStudioGalleryItemView,
  type AdStudioGallerySource,
  type AdStudioGallerySourceRef,
} from '@growthos/shared';
import {
  AdStudioBriefNotFoundError,
  AdStudioClipNotFoundError,
  AdStudioDemoRecordingNotFoundError,
  AdStudioGalleryAssetModel,
  AdStudioGalleryAssetNotFoundError,
  AdStudioGalleryInvalidError,
  AdStudioImageNotFoundError,
  AdStudioReferenceNotFoundError,
  createAdStudioGalleryAsset,
  deleteAdStudioGalleryAsset,
  getAdStudioClip,
  getAdStudioDemoRecording,
  getAdStudioGalleryAsset,
  getAdStudioImage,
  getAdStudioReference,
  listAdStudioClips,
  listAdStudioDemoRecordings,
  listAdStudioGalleryAssets,
  listAdStudioImages,
  listAdStudioReferences,
  updateAdStudioGalleryAsset,
} from '@growthos/firebase-orm-models';
import sharp from 'sharp';
import {
  FfmpegFailedError,
  FfmpegUnavailableError,
  assemblyFrame,
  defaultFfmpegRunner,
  probeMedia,
  runFfmpeg,
  videoFrameArgs,
  type FfmpegRunner,
} from './ffmpeg';
import {
  adStudioGalleryObjectPath,
  readAdStudioObject,
  resolveAdStudioMediaStorage,
  type AdStudioMediaStorage,
} from './media-storage';
import { adStudioRuntime, ensureOrm } from './runtime';

export type AdStudioGalleryRequestCode =
  | 'unsupported_media'
  | 'media_too_large'
  | 'asset_not_found'
  | 'source_not_ready'
  | 'invalid_input'
  | 'ffmpeg_unavailable'
  | 'ffmpeg_failed';

const GALLERY_ERROR_MESSAGES: Record<AdStudioGalleryRequestCode, string> = {
  unsupported_media: 'Unsupported media format. Upload a PNG/JPEG/WEBP image or an MP4/WEBM/MOV video.',
  media_too_large: 'The uploaded file exceeds the maximum allowed size.',
  asset_not_found: 'The requested gallery asset or source item could not be found.',
  source_not_ready: 'The selected media item is not ready yet.',
  invalid_input: 'Media item details are invalid or the project gallery is full.',
  ffmpeg_unavailable: 'Video processing is currently unavailable.',
  ffmpeg_failed: 'The uploaded clip could not be processed.',
};

/** Rejected gallery upload or media resolution request, translated to HTTP status in `http.ts`. */
export class AdStudioGalleryRequestError extends Error {
  constructor(
    public readonly code: AdStudioGalleryRequestCode,
    message: string = GALLERY_ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = 'AdStudioGalleryRequestError';
  }
}

export function toAdStudioGalleryItemView(
  organizationId: string,
  projectId: string,
  asset: AdStudioGalleryAssetModel,
): AdStudioGalleryItemView {
  const mediaUrl = `/api/orgs/${organizationId}/projects/${projectId}/ad-studio/gallery/${asset.id}/media`;
  return {
    id: asset.id,
    assetId: asset.id,
    kind: asset.kind,
    source: asset.source,
    label: asset.label,
    description: asset.description,
    mediaUrl,
    thumbnailUrl: asset.kind === 'image' ? mediaUrl : null,
    mimeType: asset.mime_type,
    durationSeconds: asset.duration_seconds ?? null,
    createdOn: asset.created_on,
    deletable: true,
    sourceRef: { type: 'gallery', assetId: asset.id },
  };
}

/**
 * Validates PNG/JPEG/WEBP bytes, applies EXIF orientation, and resizes either to a target
 * placement frame (`fit: 'cover'`) or within 2048px bounds for reusable gallery/reference storage.
 */
export async function normalizeUploadedImage(
  bytes: Buffer,
  target?: { width: number; height: number },
): Promise<{ bytes: Buffer; mimeType: 'image/png' | 'image/jpeg' }> {
  if (bytes.length > AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
    throw new AdStudioGalleryRequestError('media_too_large');
  }
  const sniffed = sniffReferenceMimeType(bytes);
  if (!sniffed && !isWebpBytes(bytes)) {
    throw new AdStudioGalleryRequestError('unsupported_media');
  }

  let basePipeline: sharp.Sharp;
  try {
    basePipeline = sharp(bytes, { failOn: 'error' }).rotate();
    await basePipeline.metadata();
  } catch {
    throw new AdStudioGalleryRequestError('unsupported_media');
  }

  const resized = target
    ? basePipeline.clone().resize(target.width, target.height, { fit: 'cover', position: 'centre' })
    : basePipeline.clone().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true });

  const preferPng = sniffed === 'image/png' || target !== undefined;
  if (preferPng) {
    const pngBytes = await resized.clone().png({ compressionLevel: 9 }).toBuffer();
    if (target || pngBytes.length <= AD_STUDIO_MAX_GALLERY_IMAGE_BYTES) {
      return { bytes: pngBytes, mimeType: 'image/png' };
    }
  }

  const jpgBytes = await resized.clone().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  if (jpgBytes.length <= AD_STUDIO_MAX_GALLERY_IMAGE_BYTES) {
    return { bytes: jpgBytes, mimeType: 'image/jpeg' };
  }

  const compactJpg = await resized.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  if (!target && compactJpg.length > AD_STUDIO_MAX_GALLERY_IMAGE_BYTES) {
    throw new AdStudioGalleryRequestError('media_too_large');
  }
  return { bytes: compactJpg, mimeType: 'image/jpeg' };
}

function extensionForContainer(mimeType: 'video/mp4' | 'video/webm' | 'video/quicktime'): string {
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/quicktime') return 'mov';
  return 'mp4';
}

function ffmpegClipNormalizeArgs(params: {
  inputFile: string;
  outputFile: string;
  width: number;
  height: number;
  hasAudio: boolean;
  startSeconds?: number;
  endSeconds?: number;
  durationSeconds?: number;
}): string[] {
  const trimDuration =
    params.startSeconds !== undefined && params.endSeconds !== undefined
      ? Math.max(1, params.endSeconds - params.startSeconds)
      : params.durationSeconds;

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (params.startSeconds !== undefined) args.push('-ss', String(Math.max(0, params.startSeconds)));
  args.push('-i', params.inputFile);
  if (!params.hasAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }
  args.push(
    '-vf',
    `scale=${params.width}:${params.height}:force_original_aspect_ratio=increase,crop=${params.width}:${params.height},setsar=1,fps=30`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-ac',
    '2',
  );
  if (!params.hasAudio) args.push('-shortest');
  if (trimDuration !== undefined) args.push('-t', String(trimDuration));
  args.push('-movflags', '+faststart', params.outputFile);
  return args;
}

/**
 * Validates and transcodes a user-uploaded clip or walkthrough segment into a constant-fps MP4
 * matching the ad brief aspect ratio and resolution.
 */
export async function normalizeVideoClipForScene(params: {
  bytes: Buffer;
  aspectRatio: '9:16' | '16:9';
  resolution?: '720p' | '1080p';
  durationSeconds?: number;
  startSeconds?: number;
  endSeconds?: number;
  runner?: FfmpegRunner;
}): Promise<{ bytes: Buffer; mimeType: 'video/mp4'; durationSeconds: number }> {
  if (params.bytes.length > AD_STUDIO_MAX_GALLERY_VIDEO_BYTES) {
    throw new AdStudioGalleryRequestError('media_too_large');
  }
  const container = sniffVideoContainer(params.bytes);
  if (!container) {
    throw new AdStudioGalleryRequestError('unsupported_media');
  }

  const runtimeOverride = adStudioRuntime().normalizeVideo;
  if (runtimeOverride) {
    const outBytes = await runtimeOverride({
      bytes: params.bytes,
      mimeType: container,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution ?? '720p',
      durationSeconds: params.durationSeconds,
    });
    const fallbackDuration =
      params.startSeconds !== undefined && params.endSeconds !== undefined
        ? Math.max(1, Math.round(params.endSeconds - params.startSeconds))
        : (params.durationSeconds ?? 5);
    return { bytes: outBytes, mimeType: 'video/mp4', durationSeconds: fallbackDuration };
  }

  const runner = params.runner ?? defaultFfmpegRunner();
  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-clip-'));
  const inputFile = path.join(workDir, `in.${extensionForContainer(container)}`);
  const outputFile = path.join(workDir, 'out.mp4');
  try {
    await writeFile(inputFile, params.bytes);
    let probed: Awaited<ReturnType<typeof probeMedia>>;
    try {
      probed = await probeMedia(inputFile, runner);
    } catch (error) {
      if (error instanceof FfmpegUnavailableError) {
        if (params.startSeconds === undefined && container === 'video/mp4') {
          return { bytes: params.bytes, mimeType: 'video/mp4', durationSeconds: params.durationSeconds ?? 5 };
        }
        throw new AdStudioGalleryRequestError('ffmpeg_unavailable');
      }
      throw new AdStudioGalleryRequestError('ffmpeg_failed');
    }

    if (!probed.hasVideo) throw new AdStudioGalleryRequestError('unsupported_media');
    const format = params.aspectRatio === '9:16' ? 'vertical' : 'horizontal';
    const frame = assemblyFrame(format, params.resolution);
    const args = ffmpegClipNormalizeArgs({
      inputFile,
      outputFile,
      width: frame.width,
      height: frame.height,
      hasAudio: probed.hasAudio,
      startSeconds: params.startSeconds,
      endSeconds: params.endSeconds,
      durationSeconds: params.durationSeconds,
    });
    const result = await runFfmpeg(args, runner).catch((error) => {
      if (error instanceof FfmpegUnavailableError) throw new AdStudioGalleryRequestError('ffmpeg_unavailable');
      throw error;
    });
    if (result.code !== 0) {
      throw new AdStudioGalleryRequestError('ffmpeg_failed', `Clip transcoding exited with status ${result.code}`);
    }
    const outBytes = await readFile(outputFile);
    const outProbe = await probeMedia(outputFile, runner).catch(() => null);
    const durationSeconds = Math.max(
      1,
      Math.round(outProbe?.durationSeconds ?? params.durationSeconds ?? probed.durationSeconds ?? 5),
    );
    return { bytes: outBytes, mimeType: 'video/mp4', durationSeconds };
  } catch (error) {
    if (error instanceof AdStudioGalleryRequestError) throw error;
    if (error instanceof FfmpegUnavailableError) throw new AdStudioGalleryRequestError('ffmpeg_unavailable');
    if (error instanceof FfmpegFailedError) throw new AdStudioGalleryRequestError('ffmpeg_failed', error.message);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractVideoFrameJpeg(params: {
  videoBytes: Buffer;
  container: 'video/mp4' | 'video/webm' | 'video/quicktime';
  atSeconds: number;
  runner?: FfmpegRunner;
}): Promise<Buffer> {
  const runner = params.runner ?? defaultFfmpegRunner();
  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-frame-'));
  const inputFile = path.join(workDir, `in.${extensionForContainer(params.container)}`);
  const outputFile = path.join(workDir, 'frame.jpg');
  try {
    await writeFile(inputFile, params.videoBytes);
    const result = await runFfmpeg(videoFrameArgs(inputFile, outputFile, Math.max(0, params.atSeconds)), runner);
    if (result.code !== 0) throw new AdStudioGalleryRequestError('ffmpeg_failed');
    return await readFile(outputFile);
  } catch (error) {
    if (error instanceof AdStudioGalleryRequestError) throw error;
    if (error instanceof FfmpegUnavailableError) throw new AdStudioGalleryRequestError('ffmpeg_unavailable');
    throw new AdStudioGalleryRequestError('ffmpeg_failed');
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function bestEffortVideoDuration(
  bytes: Buffer,
  container: 'video/mp4' | 'video/webm' | 'video/quicktime',
  runner?: FfmpegRunner,
): Promise<number | null> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-probe-'));
  const inputFile = path.join(workDir, `in.${extensionForContainer(container)}`);
  try {
    await writeFile(inputFile, bytes);
    const probed = await probeMedia(inputFile, runner ?? defaultFfmpegRunner());
    if (!probed.hasVideo || probed.durationSeconds === null) return null;
    return Math.round(probed.durationSeconds * 10) / 10;
  } catch {
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Uploads an image or video clip from the user's computer into the project's reusable gallery. */
export async function addUploadedGalleryAsset(
  ctx: { organizationId: string; projectId: string; actorId: string },
  input: { bytes: Buffer; fileName?: string | null; label?: string | null; description?: string | null; source?: AdStudioGallerySource },
  deps: { storage?: AdStudioMediaStorage; runner?: FfmpegRunner; now?: Date } = {},
): Promise<AdStudioGalleryAssetModel> {
  await ensureOrm();
  const storage = deps.storage ?? resolveAdStudioMediaStorage();
  const isImg = Boolean(sniffReferenceMimeType(input.bytes) || isWebpBytes(input.bytes));
  const videoContainer = isImg ? null : sniffVideoContainer(input.bytes);
  if (!isImg && !videoContainer) {
    throw new AdStudioGalleryRequestError('unsupported_media');
  }

  let storedBytes: Buffer;
  let storedMime: string;
  let durationSeconds: number | null = null;
  const kind = isImg ? 'image' : 'video';

  if (isImg) {
    const normalized = await normalizeUploadedImage(input.bytes);
    storedBytes = normalized.bytes;
    storedMime = normalized.mimeType;
  } else {
    if (input.bytes.length > AD_STUDIO_MAX_GALLERY_VIDEO_BYTES) {
      throw new AdStudioGalleryRequestError('media_too_large');
    }
    storedBytes = input.bytes;
    storedMime = videoContainer as 'video/mp4' | 'video/webm' | 'video/quicktime';
    durationSeconds = adStudioRuntime().normalizeVideo
      ? null
      : await bestEffortVideoDuration(
          storedBytes,
          videoContainer as 'video/mp4' | 'video/webm' | 'video/quicktime',
          deps.runner,
        );
  }

  const fallbackLabel = kind === 'video' ? 'Video clip' : 'Image';
  const rawLabel = (input.label ?? '').trim() || galleryLabelFromFileName(input.fileName ?? '') || fallbackLabel;
  const label = rawLabel.slice(0, AD_STUDIO_GALLERY_LABEL_MAX);
  const description = (input.description ?? '').trim().slice(0, AD_STUDIO_GALLERY_DESCRIPTION_MAX);
  const assetId = randomUUID();
  const gcsPath = adStudioGalleryObjectPath({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    assetId,
    mimeType: storedMime,
  });

  await storage.upload(gcsPath, storedBytes, storedMime);
  try {
    return await createAdStudioGalleryAsset({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      id: assetId,
      kind,
      source: input.source ?? 'upload',
      label,
      description,
      gcsPath,
      mimeType: storedMime,
      byteSize: storedBytes.length,
      durationSeconds,
      actorId: ctx.actorId,
      now: deps.now,
    });
  } catch (error) {
    await storage.deletePrefix(gcsPath).catch(() => {});
    if (error instanceof AdStudioGalleryInvalidError) {
      throw new AdStudioGalleryRequestError('invalid_input', error.message);
    }
    throw error;
  }
}

export async function listProjectGallery(ctx: { organizationId: string; projectId: string }): Promise<AdStudioGalleryItemView[]> {
  await ensureOrm();
  const assets = await listAdStudioGalleryAssets(ctx.organizationId, ctx.projectId);
  return assets.map((asset) => toAdStudioGalleryItemView(ctx.organizationId, ctx.projectId, asset));
}

/**
 * Returns every reusable visual/video item available in the project for picker dialogs: saved
 * gallery items, scanned product walkthrough segments, and (when `briefId` is given) ready brief
 * references, rendered images, and ready scene clips.
 */
export async function listAllProjectMediaSources(ctx: {
  organizationId: string;
  projectId: string;
  briefId?: string;
}): Promise<AdStudioGalleryItemView[]> {
  await ensureOrm();
  const items: AdStudioGalleryItemView[] = [];
  const base = `/api/orgs/${ctx.organizationId}/projects/${ctx.projectId}/ad-studio`;

  const assets = await listAdStudioGalleryAssets(ctx.organizationId, ctx.projectId);
  for (const asset of assets) {
    items.push(toAdStudioGalleryItemView(ctx.organizationId, ctx.projectId, asset));
  }

  const recordings = await listAdStudioDemoRecordings(ctx.organizationId, ctx.projectId);
  for (const rec of recordings) {
    if (rec.status !== 'ready') continue;
    for (const seg of rec.segments) {
      const dur = Math.max(1, Math.round((seg.end_seconds - seg.start_seconds) * 10) / 10);
      const frameUrl = `${base}/demo-recordings/${rec.id}/segments/${seg.id}/frame`;
      const videoUrl = `${base}/demo-recordings/${rec.id}/media`;
      items.push({
        id: `demo-vid:${rec.id}:${seg.id}`,
        assetId: null,
        kind: 'video',
        source: 'walkthrough',
        label: seg.title,
        description: seg.description,
        mediaUrl: videoUrl,
        thumbnailUrl: seg.frame_gcs_path ? frameUrl : null,
        mimeType: 'video/mp4',
        durationSeconds: dur,
        createdOn: rec.completed_on ?? rec.requested_on,
        deletable: false,
        sourceRef: { type: 'demo_segment', recordingId: rec.id, segmentId: seg.id },
      });
      if (seg.frame_gcs_path) {
        items.push({
          id: `demo-img:${rec.id}:${seg.id}`,
          assetId: null,
          kind: 'image',
          source: 'walkthrough',
          label: seg.title,
          description: seg.description,
          mediaUrl: frameUrl,
          thumbnailUrl: frameUrl,
          mimeType: 'image/jpeg',
          durationSeconds: null,
          createdOn: rec.completed_on ?? rec.requested_on,
          deletable: false,
          sourceRef: { type: 'demo_segment', recordingId: rec.id, segmentId: seg.id },
        });
      }
    }
  }

  if (ctx.briefId) {
    const [refs, briefImages, briefClips] = await Promise.all([
      listAdStudioReferences(ctx.organizationId, ctx.projectId, ctx.briefId).catch(() => []),
      listAdStudioImages(ctx.organizationId, ctx.projectId, ctx.briefId).catch(() => []),
      listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId).catch(() => []),
    ]);
    for (const ref of refs) {
      if (ref.status !== 'ready') continue;
      const url = `${base}/briefs/${ctx.briefId}/references/${ref.id}/media`;
      items.push({
        id: `ref:${ref.id}`,
        assetId: null,
        kind: 'image',
        source: 'brief_reference',
        label: ref.label,
        description: ref.description,
        mediaUrl: url,
        thumbnailUrl: url,
        mimeType: ref.mime_type ?? 'image/png',
        durationSeconds: null,
        createdOn: ref.created_on,
        deletable: false,
        sourceRef: { type: 'brief_reference', briefId: ctx.briefId, referenceId: ref.id },
      });
    }
    for (const img of briefImages) {
      if (img.status !== 'ready') continue;
      const url = `${base}/briefs/${ctx.briefId}/images/${img.id}/media`;
      items.push({
        id: `img:${img.id}`,
        assetId: null,
        kind: 'image',
        source: 'brief_image',
        label: img.image_format,
        description: img.prompt.slice(0, 120),
        mediaUrl: url,
        thumbnailUrl: url,
        mimeType: img.mime_type ?? 'image/png',
        durationSeconds: null,
        createdOn: img.completed_on ?? img.requested_on,
        deletable: false,
        sourceRef: { type: 'brief_image', briefId: ctx.briefId, imageId: img.id },
      });
    }
    for (const clip of briefClips) {
      if (clip.status !== 'ready') continue;
      const url = `${base}/briefs/${ctx.briefId}/clips/${clip.id}/media`;
      items.push({
        id: `clip:${clip.id}`,
        assetId: null,
        kind: 'video',
        source: 'brief_clip',
        label: clip.prompt.slice(0, 80) || clip.scene_id,
        description: '',
        mediaUrl: url,
        thumbnailUrl: null,
        mimeType: 'video/mp4',
        durationSeconds: clip.duration_seconds,
        createdOn: clip.completed_on ?? clip.requested_on,
        deletable: false,
        sourceRef: { type: 'brief_clip', briefId: ctx.briefId, clipId: clip.id },
      });
    }
  }

  return items;
}

export async function updateProjectGalleryAsset(ctx: {
  organizationId: string;
  projectId: string;
  assetId: string;
  label?: string;
  description?: string;
}): Promise<AdStudioGalleryItemView> {
  await ensureOrm();
  try {
    const updated = await updateAdStudioGalleryAsset(ctx);
    return toAdStudioGalleryItemView(ctx.organizationId, ctx.projectId, updated);
  } catch (error) {
    if (error instanceof AdStudioGalleryAssetNotFoundError) throw new AdStudioGalleryRequestError('asset_not_found');
    if (error instanceof AdStudioGalleryInvalidError) throw new AdStudioGalleryRequestError('invalid_input', error.message);
    throw error;
  }
}

export async function readGalleryAssetMedia(
  ctx: { organizationId: string; projectId: string; assetId: string },
  storage: AdStudioMediaStorage = resolveAdStudioMediaStorage(),
): Promise<{ asset: AdStudioGalleryAssetModel; bytes: Buffer; mimeType: string }> {
  await ensureOrm();
  let asset: AdStudioGalleryAssetModel;
  try {
    asset = await getAdStudioGalleryAsset(ctx.organizationId, ctx.projectId, ctx.assetId);
  } catch (error) {
    if (error instanceof AdStudioGalleryAssetNotFoundError) throw new AdStudioGalleryRequestError('asset_not_found');
    throw error;
  }
  const maxBytes = asset.kind === 'video' ? AD_STUDIO_MAX_GALLERY_VIDEO_BYTES : AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES;
  const bytes = await readAdStudioObject(storage, asset.gcs_path, maxBytes);
  return { asset, bytes, mimeType: asset.mime_type };
}

export async function removeGalleryAsset(
  ctx: { organizationId: string; projectId: string; assetId: string },
  storage: AdStudioMediaStorage = resolveAdStudioMediaStorage(),
): Promise<void> {
  await ensureOrm();
  let deleted: { gcsPath: string };
  try {
    deleted = await deleteAdStudioGalleryAsset(ctx.organizationId, ctx.projectId, ctx.assetId);
  } catch (error) {
    if (error instanceof AdStudioGalleryAssetNotFoundError) throw new AdStudioGalleryRequestError('asset_not_found');
    throw error;
  }
  await storage.deletePrefix(deleted.gcsPath).catch(() => {});
}

export interface ResolvedGalleryMedia {
  kind: 'image' | 'video';
  bytes: Buffer;
  mimeType: string;
  label: string;
  description: string;
  startSeconds?: number;
  endSeconds?: number;
}

/**
 * Resolves any gallery, walkthrough segment, brief reference, generated image, or scene clip
 * reference into concrete bytes ready for insertion into a scene or image ad.
 */
export async function resolveGallerySource(
  ctx: { organizationId: string; projectId: string },
  source: AdStudioGallerySourceRef,
  wantedKind: 'image' | 'video',
  deps: { storage?: AdStudioMediaStorage; runner?: FfmpegRunner } = {},
): Promise<ResolvedGalleryMedia> {
  await ensureOrm();
  const storage = deps.storage ?? resolveAdStudioMediaStorage();
  try {
    switch (source.type) {
      case 'gallery': {
        const asset = await getAdStudioGalleryAsset(ctx.organizationId, ctx.projectId, source.assetId);
        if (asset.kind === 'video' && wantedKind === 'image') {
          const videoBytes = await readAdStudioObject(storage, asset.gcs_path, AD_STUDIO_MAX_GALLERY_VIDEO_BYTES);
          const container = sniffVideoContainer(videoBytes) ?? 'video/mp4';
          const midpoint = asset.duration_seconds ? asset.duration_seconds / 2 : 0.5;
          const jpg = await extractVideoFrameJpeg({ videoBytes, container, atSeconds: midpoint, runner: deps.runner });
          return { kind: 'image', bytes: jpg, mimeType: 'image/jpeg', label: asset.label, description: asset.description };
        }
        if (asset.kind !== wantedKind) {
          throw new AdStudioGalleryRequestError('unsupported_media');
        }
        const maxBytes = wantedKind === 'video' ? AD_STUDIO_MAX_GALLERY_VIDEO_BYTES : AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES;
        const bytes = await readAdStudioObject(storage, asset.gcs_path, maxBytes);
        return { kind: wantedKind, bytes, mimeType: asset.mime_type, label: asset.label, description: asset.description };
      }
      case 'brief_reference': {
        if (wantedKind !== 'image') throw new AdStudioGalleryRequestError('unsupported_media');
        const ref = await getAdStudioReference(ctx.organizationId, ctx.projectId, source.briefId, source.referenceId);
        if (ref.status !== 'ready' || !ref.gcs_path) throw new AdStudioGalleryRequestError('source_not_ready');
        const bytes = await readAdStudioObject(storage, ref.gcs_path, AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES);
        return { kind: 'image', bytes, mimeType: ref.mime_type ?? 'image/png', label: ref.label, description: ref.description };
      }
      case 'brief_image': {
        if (wantedKind !== 'image') throw new AdStudioGalleryRequestError('unsupported_media');
        const img = await getAdStudioImage(ctx.organizationId, ctx.projectId, source.briefId, source.imageId);
        if (img.status !== 'ready' || !img.gcs_path) throw new AdStudioGalleryRequestError('source_not_ready');
        const bytes = await readAdStudioObject(storage, img.gcs_path, AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES);
        return { kind: 'image', bytes, mimeType: img.mime_type ?? 'image/png', label: img.concept_id, description: '' };
      }
      case 'brief_clip': {
        const clip = await getAdStudioClip(ctx.organizationId, ctx.projectId, source.briefId, source.clipId);
        if (clip.status !== 'ready' || !clip.gcs_path) throw new AdStudioGalleryRequestError('source_not_ready');
        const clipBytes = await readAdStudioObject(storage, clip.gcs_path, AD_STUDIO_MAX_GALLERY_VIDEO_BYTES);
        if (wantedKind === 'image') {
          const jpg = await extractVideoFrameJpeg({
            videoBytes: clipBytes,
            container: 'video/mp4',
            atSeconds: Math.max(0.2, clip.duration_seconds / 2),
            runner: deps.runner,
          });
          return { kind: 'image', bytes: jpg, mimeType: 'image/jpeg', label: clip.scene_id, description: '' };
        }
        return { kind: 'video', bytes: clipBytes, mimeType: 'video/mp4', label: clip.scene_id, description: '' };
      }
      case 'demo_segment': {
        const recording = await getAdStudioDemoRecording(ctx.organizationId, ctx.projectId, source.recordingId);
        if (recording.status !== 'ready' || !recording.gcs_path) throw new AdStudioGalleryRequestError('source_not_ready');
        const segment = recording.segments.find((entry) => entry.id === source.segmentId);
        if (!segment) throw new AdStudioGalleryRequestError('asset_not_found');
        if (wantedKind === 'image') {
          if (segment.frame_gcs_path) {
            const frameBytes = await readAdStudioObject(storage, segment.frame_gcs_path, AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES);
            return { kind: 'image', bytes: frameBytes, mimeType: 'image/jpeg', label: segment.title, description: segment.description };
          }
          const videoBytes = await readAdStudioObject(storage, recording.gcs_path, AD_STUDIO_MAX_GALLERY_VIDEO_BYTES);
          const midpoint = (segment.start_seconds + segment.end_seconds) / 2;
          const jpg = await extractVideoFrameJpeg({ videoBytes, container: 'video/mp4', atSeconds: midpoint, runner: deps.runner });
          return { kind: 'image', bytes: jpg, mimeType: 'image/jpeg', label: segment.title, description: segment.description };
        }
        const videoBytes = await readAdStudioObject(storage, recording.gcs_path, AD_STUDIO_MAX_GALLERY_VIDEO_BYTES);
        return {
          kind: 'video',
          bytes: videoBytes,
          mimeType: 'video/mp4',
          label: segment.title,
          description: segment.description,
          startSeconds: segment.start_seconds,
          endSeconds: segment.end_seconds,
        };
      }
    }
  } catch (error) {
    if (error instanceof AdStudioGalleryRequestError) throw error;
    if (
      error instanceof AdStudioGalleryAssetNotFoundError ||
      error instanceof AdStudioReferenceNotFoundError ||
      error instanceof AdStudioImageNotFoundError ||
      error instanceof AdStudioClipNotFoundError ||
      error instanceof AdStudioDemoRecordingNotFoundError ||
      error instanceof AdStudioBriefNotFoundError
    ) {
      throw new AdStudioGalleryRequestError('asset_not_found');
    }
    throw error;
  }
}
