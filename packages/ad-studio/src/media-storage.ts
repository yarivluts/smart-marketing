import { createReadStream as createLocalReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { AD_STUDIO_TEST_MEDIA_DIR, adStudioTestOverride } from './test-overrides';
import { adStudioRuntime } from './runtime';

/**
 * Where the Ad Studio keeps its clips and assembled videos (KAN-231): a private GCS bucket with
 * public access prevention enforced. Objects are never made public and no signed URLs are handed
 * out; the page reads them only through the permission-checked media routes, which stream them.
 * The interface lets tests use an in-memory store and local verification a folder.
 */

export const AD_STUDIO_DEFAULT_BUCKET = 'growthos-g2w84-ad-studio';

export interface MediaByteRange {
  start: number;
  /** Inclusive, as in HTTP ranges. */
  end: number;
}

export interface AdStudioMediaStorage {
  /** What the admin panel shows: which store, and its bucket or folder. */
  describe(): { kind: 'gcs' | 'local' | 'memory'; location: string };
  upload(objectPath: string, data: Buffer, contentType: string): Promise<void>;
  downloadToFile(objectPath: string, localFile: string): Promise<void>;
  /** Size in bytes, or null when the object does not exist. */
  size(objectPath: string): Promise<number | null>;
  read(objectPath: string, range?: MediaByteRange): Readable;
  /** Removes every object under a prefix (a deleted brief's media). */
  deletePrefix(prefix: string): Promise<void>;
}

interface BriefRef {
  organizationId: string;
  projectId: string;
  briefId: string;
}

export function adStudioBriefMediaPrefix({ organizationId, projectId, briefId }: BriefRef): string {
  return `orgs/${organizationId}/projects/${projectId}/briefs/${briefId}/`;
}

export function adStudioClipObjectPath(ref: BriefRef & { clipId: string }): string {
  return `${adStudioBriefMediaPrefix(ref)}clips/${ref.clipId}.mp4`;
}

export function adStudioVideoObjectPath(ref: BriefRef & { videoId: string }): string {
  return `${adStudioBriefMediaPrefix(ref)}videos/${ref.videoId}.mp4`;
}

function assertSafePath(objectPath: string): void {
  if (objectPath.length === 0 || objectPath.startsWith('/') || objectPath.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error('Unsafe media object path.');
  }
}

export function createGcsMediaStorage(bucketName: string): AdStudioMediaStorage {
  // Loaded on first use so pages that never touch media do not pay for the client.
  let bucketPromise: Promise<import('@google-cloud/storage').Bucket> | null = null;
  const bucket = () => {
    bucketPromise ??= import('@google-cloud/storage').then(({ Storage }) => new Storage().bucket(bucketName));
    return bucketPromise;
  };
  return {
    describe: () => ({ kind: 'gcs', location: bucketName }),
    async upload(objectPath, data, contentType) {
      assertSafePath(objectPath);
      await (await bucket()).file(objectPath).save(data, { contentType, resumable: false, metadata: { cacheControl: 'private, max-age=0' } });
    },
    async downloadToFile(objectPath, localFile) {
      assertSafePath(objectPath);
      await (await bucket()).file(objectPath).download({ destination: localFile });
    },
    async size(objectPath) {
      assertSafePath(objectPath);
      try {
        const [metadata] = await (await bucket()).file(objectPath).getMetadata();
        return Number(metadata.size ?? 0);
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw error;
      }
    },
    read(objectPath, range) {
      assertSafePath(objectPath);
      const passThrough = new PassThrough();
      bucket()
        .then((resolved) => {
          const source = resolved.file(objectPath).createReadStream(range ? { start: range.start, end: range.end } : {});
          source.on('error', (error) => passThrough.destroy(error));
          source.pipe(passThrough);
        })
        .catch((error: Error) => passThrough.destroy(error));
      return passThrough;
    },
    async deletePrefix(prefix) {
      assertSafePath(prefix);
      await (await bucket()).deleteFiles({ prefix, force: true });
    },
  };
}

/** A folder on this machine - only ever selected through the guarded test override. */
export function createLocalMediaStorage(root: string): AdStudioMediaStorage {
  const resolve = (objectPath: string) => {
    assertSafePath(objectPath);
    return path.join(root, ...objectPath.split('/'));
  };
  return {
    describe: () => ({ kind: 'local', location: root }),
    async upload(objectPath, data) {
      const file = resolve(objectPath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async downloadToFile(objectPath, localFile) {
      await writeFile(localFile, await readFile(resolve(objectPath)));
    },
    async size(objectPath) {
      try {
        return (await stat(resolve(objectPath))).size;
      } catch {
        return null;
      }
    },
    read(objectPath, range) {
      return createLocalReadStream(resolve(objectPath), range ? { start: range.start, end: range.end } : {});
    },
    async deletePrefix(prefix) {
      await rm(resolve(prefix.replace(/\/+$/, '')), { recursive: true, force: true });
    },
  };
}

/** For tests: everything in a Map. */
export function createMemoryMediaStorage(): AdStudioMediaStorage & { objects: Map<string, { data: Buffer; contentType: string }> } {
  const objects = new Map<string, { data: Buffer; contentType: string }>();
  return {
    objects,
    describe: () => ({ kind: 'memory', location: 'memory' }),
    async upload(objectPath, data, contentType) {
      assertSafePath(objectPath);
      objects.set(objectPath, { data: Buffer.from(data), contentType });
    },
    async downloadToFile(objectPath, localFile) {
      const entry = objects.get(objectPath);
      if (!entry) throw new Error(`No object at ${objectPath}`);
      await writeFile(localFile, entry.data);
    },
    async size(objectPath) {
      return objects.get(objectPath)?.data.length ?? null;
    },
    read(objectPath, range) {
      const entry = objects.get(objectPath);
      if (!entry) throw new Error(`No object at ${objectPath}`);
      return Readable.from([range ? entry.data.subarray(range.start, range.end + 1) : entry.data]);
    },
    async deletePrefix(prefix) {
      for (const key of [...objects.keys()]) if (key.startsWith(prefix)) objects.delete(key);
    },
  };
}

let cached: { key: string; storage: AdStudioMediaStorage } | null = null;

/** The deployment's store: the bucket from AD_STUDIO_BUCKET (default {@link AD_STUDIO_DEFAULT_BUCKET}), or the guarded local test folder. */
export function resolveAdStudioMediaStorage(env: NodeJS.ProcessEnv = process.env): AdStudioMediaStorage {
  const override = adStudioRuntime().mediaStorage;
  if (override) return override();
  const localDir = adStudioTestOverride(env, AD_STUDIO_TEST_MEDIA_DIR);
  const bucket = env.AD_STUDIO_BUCKET?.trim() || AD_STUDIO_DEFAULT_BUCKET;
  const key = localDir ? `local:${localDir}` : `gcs:${bucket}`;
  if (cached?.key !== key) cached = { key, storage: localDir ? createLocalMediaStorage(localDir) : createGcsMediaStorage(bucket) };
  return cached.storage;
}
