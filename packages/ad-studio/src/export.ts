import {
  exportAdStudioVideo,
  getAdStudioVideo,
  type AdStudioExportDestination,
  type AdStudioExportModel,
  type YouTubePrivacyStatus,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { getServerKmsProvider } from './runtime';
import { resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';

/** A 60-second ad is a few tens of MB; anything far past that is not an Ad Studio video. */
export const AD_STUDIO_EXPORT_MAX_BYTES = 200 * 1024 * 1024;

export class AdStudioExportVideoNotReadyError extends Error {
  constructor() {
    super('That video is not assembled yet.');
    this.name = 'AdStudioExportVideoNotReadyError';
  }
}

async function readAll(storage: AdStudioMediaStorage, objectPath: string): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of storage.read(objectPath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.byteLength;
    if (total > AD_STUDIO_EXPORT_MAX_BYTES) throw new Error('The video is larger than an Ad Studio export allows.');
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Exports one assembled video of a brief (KAN-232): only a `ready` video with a stored file, read
 * from the studio's private storage and handed to the platform upload with the project's credential,
 * decrypted in memory by the server's vault. The service records the export and audits it.
 */
export async function exportBriefVideo(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  videoId: string;
  destination: AdStudioExportDestination;
  title: string;
  description: string;
  privacy?: YouTubePrivacyStatus;
  actorId: string;
  storage?: AdStudioMediaStorage;
}): Promise<AdStudioExportModel> {
  await ensureOrm();
  const video = await getAdStudioVideo(params.organizationId, params.projectId, params.briefId, params.videoId);
  const objectPath = video.gcs_path;
  if (video.status !== 'ready' || !objectPath) throw new AdStudioExportVideoNotReadyError();
  const storage = params.storage ?? resolveAdStudioMediaStorage();
  return exportAdStudioVideo({
    organizationId: params.organizationId,
    projectId: params.projectId,
    briefId: params.briefId,
    videoId: params.videoId,
    destination: params.destination,
    title: params.title,
    description: params.description,
    ...(params.privacy ? { privacy: params.privacy } : {}),
    readVideo: () => readAll(storage, objectPath),
    kms: getServerKmsProvider(),
    actorId: params.actorId,
  });
}
