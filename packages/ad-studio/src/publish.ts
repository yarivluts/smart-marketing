import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSearchTargeting } from '@growthos/shared';
import {
  AdStudioExportInvalidError,
  getAdStudioBrief,
  getAdStudioImage,
  getAdStudioVideo,
  listAdStudioImages,
  publishAdStudioAd,
  type AdStudioAdCopy,
  type AdStudioExportModel,
  type AdStudioPublishDestination,
  type AdStudioPublishMedia,
} from '@growthos/firebase-orm-models';
import { ensureOrm, getServerKmsProvider } from './runtime';
import { cropToAspectArgs, defaultFfmpegRunner, FfmpegFailedError, runFfmpeg, videoFrameArgs, type FfmpegRunner } from './ffmpeg';
import { readAdStudioObject, resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';
import { AdStudioImageRequestError } from './image-pipeline';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export type AdStudioPublishSource = { kind: 'image'; imageId: string } | { kind: 'video'; videoId: string } | { kind: 'search' };

async function withTemp<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-publish-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function ffmpegTransform(runner: FfmpegRunner, input: Buffer, inputName: string, outputName: string, args: (input: string, output: string) => string[]): Promise<Buffer> {
  return withTemp(async (dir) => {
    const source = path.join(dir, inputName);
    const target = path.join(dir, outputName);
    await writeFile(source, input);
    const { code, stderr } = await runFfmpeg(args(source, target), runner);
    if (code !== 0) throw new FfmpegFailedError('ffmpeg could not prepare the media for the platform.', stderr);
    return readFile(target);
  });
}

/**
 * Publishes an Ad Studio creative as a real, paused ad on Meta or Google Ads (the stepper's publish
 * step). For an image, the chosen image of its idea is used; Google's required 1.91:1 and 1:1 images
 * come from the idea's own landscape and square renders when they exist, otherwise they are centre
 * crops of the chosen image. For a video, the assembled video is uploaded with a thumbnail frame.
 */
export async function publishBriefAd(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  destination: AdStudioPublishDestination;
  source: AdStudioPublishSource;
  copy: AdStudioAdCopy;
  campaignName: string;
  dailyBudget: number;
  countries: string[];
  containsEuPoliticalAdvertising?: boolean;
  actorId: string;
  actorType?: 'user' | 'api_key';
  storage?: AdStudioMediaStorage;
  runner?: FfmpegRunner;
}): Promise<AdStudioExportModel> {
  await ensureOrm();
  const storage = params.storage ?? resolveAdStudioMediaStorage();
  const runner = params.runner ?? defaultFfmpegRunner();
  let media: AdStudioPublishMedia;
  if (params.source.kind === 'search') {
    // The saved search ad and keywords, as they are now: nothing to render or crop.
    const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
    if (!brief.search_ad) throw new AdStudioExportInvalidError(['write the search ad first']);
    media = {
      kind: 'search',
      ad: brief.search_ad,
      keywords: brief.search_keywords?.keywords ?? [],
      negatives: brief.search_keywords?.negatives ?? [],
      targeting: brief.search_keywords?.targeting ?? defaultSearchTargeting(brief.language),
    };
  } else if (params.source.kind === 'image') {
    const image = await getAdStudioImage(params.organizationId, params.projectId, params.briefId, params.source.imageId);
    if (image.status !== 'ready' || !image.gcs_path) throw new AdStudioImageRequestError('image_not_ready');
    const primary = await readAdStudioObject(storage, image.gcs_path, MAX_IMAGE_BYTES);
    let square: Buffer | null = null;
    let landscape: Buffer | null = null;
    if (params.destination === 'google_ads') {
      const siblings = (await listAdStudioImages(params.organizationId, params.projectId, params.briefId)).filter(
        (row) => row.concept_id === image.concept_id && row.selected && row.status === 'ready' && row.gcs_path,
      );
      const read = async (format: string) => {
        const row = format === image.image_format ? image : siblings.find((candidate) => candidate.image_format === format);
        return row?.gcs_path ? readAdStudioObject(storage, row.gcs_path, MAX_IMAGE_BYTES) : null;
      };
      const squareSource = (await read('square')) ?? primary;
      const landscapeSource = (await read('landscape')) ?? primary;
      square = await ffmpegTransform(runner, squareSource, 'in.png', 'square.png', (input, output) => cropToAspectArgs(input, output, 1200, 1200));
      landscape = await ffmpegTransform(runner, landscapeSource, 'in.png', 'landscape.png', (input, output) => cropToAspectArgs(input, output, 1200, 628));
    }
    media = { kind: 'image', imageId: image.id, primary, square, landscape };
  } else {
    const video = await getAdStudioVideo(params.organizationId, params.projectId, params.briefId, params.source.videoId);
    if (video.status !== 'ready' || !video.gcs_path) throw new AdStudioImageRequestError('image_not_ready');
    const bytes = await readAdStudioObject(storage, video.gcs_path, MAX_VIDEO_BYTES);
    const thumbnail = await ffmpegTransform(runner, bytes, 'in.mp4', 'thumb.jpg', (input, output) => videoFrameArgs(input, output, Math.min(1, Math.max(0, (video.duration_seconds ?? 2) / 2))));
    media = { kind: 'video', videoId: video.id, video: bytes, thumbnail };
  }
  return publishAdStudioAd({
    organizationId: params.organizationId,
    projectId: params.projectId,
    briefId: params.briefId,
    destination: params.destination,
    media,
    copy: params.copy,
    campaignName: params.campaignName,
    dailyBudget: params.dailyBudget,
    countries: params.countries,
    ...(params.containsEuPoliticalAdvertising !== undefined ? { containsEuPoliticalAdvertising: params.containsEuPoliticalAdvertising } : {}),
    kms: getServerKmsProvider(),
    actorId: params.actorId,
    actorType: params.actorType,
  });
}
