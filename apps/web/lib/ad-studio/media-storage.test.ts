// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adStudioBriefMediaPrefix,
  adStudioClipObjectPath,
  adStudioVideoObjectPath,
  createLocalMediaStorage,
  createMemoryMediaStorage,
  resolveAdStudioMediaStorage,
} from './media-storage';
import { parseByteRange, streamAdStudioMedia } from './media-response';

vi.mock('server-only', () => ({}));

const REF = { organizationId: 'o1', projectId: 'p1', briefId: 'b1' };
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('object paths and store selection', () => {
  it('keeps every object of a brief under one prefix', () => {
    expect(adStudioBriefMediaPrefix(REF)).toBe('orgs/o1/projects/p1/briefs/b1/');
    expect(adStudioClipObjectPath({ ...REF, clipId: 'c1' })).toBe('orgs/o1/projects/p1/briefs/b1/clips/c1.mp4');
    expect(adStudioVideoObjectPath({ ...REF, videoId: 'v1' })).toBe('orgs/o1/projects/p1/briefs/b1/videos/v1.mp4');
  });

  it('uses the private bucket by default and a local folder only when the emulator is set too', () => {
    expect(resolveAdStudioMediaStorage({} as NodeJS.ProcessEnv).describe()).toEqual({ kind: 'gcs', location: 'growthos-g2w84-ad-studio' });
    expect(resolveAdStudioMediaStorage({ AD_STUDIO_BUCKET: 'other-bucket' } as unknown as NodeJS.ProcessEnv).describe().location).toBe('other-bucket');
    expect(resolveAdStudioMediaStorage({ AD_STUDIO_TEST_MEDIA_DIR: '/tmp/media' } as unknown as NodeJS.ProcessEnv).describe().kind).toBe('gcs');
    expect(resolveAdStudioMediaStorage({ AD_STUDIO_TEST_MEDIA_DIR: '/tmp/media', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8090' } as unknown as NodeJS.ProcessEnv).describe()).toEqual({
      kind: 'local',
      location: '/tmp/media',
    });
  });

  it('the local store writes, sizes, reads ranges and deletes a prefix, and refuses path traversal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ad-studio-media-'));
    temporary.push(root);
    const storage = createLocalMediaStorage(root);
    const objectPath = adStudioClipObjectPath({ ...REF, clipId: 'c1' });
    await storage.upload(objectPath, Buffer.from('0123456789'), 'video/mp4');
    expect(await storage.size(objectPath)).toBe(10);
    const chunks: Buffer[] = [];
    for await (const chunk of storage.read(objectPath, { start: 2, end: 4 })) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('234');
    const copy = path.join(root, 'copy.mp4');
    await storage.downloadToFile(objectPath, copy);
    expect((await readFile(copy)).toString()).toBe('0123456789');
    await storage.deletePrefix(adStudioBriefMediaPrefix(REF));
    expect(await storage.size(objectPath)).toBeNull();
    await expect(storage.upload('../escape.mp4', Buffer.from('x'), 'video/mp4')).rejects.toThrow('Unsafe');
  });
});

describe('parseByteRange', () => {
  it('reads start-end, open-ended and suffix ranges, clamps the end, and flags unsatisfiable ones', () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=9-2', 100)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseByteRange('items=0-1', 100)).toBeNull();
  });
});

describe('streamAdStudioMedia', () => {
  it('sends the whole object, a 206 partial with Content-Range, a 416, and a 404 for a missing object', async () => {
    const storage = createMemoryMediaStorage();
    await storage.upload('a/clip.mp4', Buffer.from('0123456789'), 'video/mp4');

    const whole = await streamAdStudioMedia(storage, 'a/clip.mp4', null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(whole.headers.get('cache-control')).toBe('private, no-store');
    expect(await whole.text()).toBe('0123456789');

    const partial = await streamAdStudioMedia(storage, 'a/clip.mp4', 'bytes=3-5');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 3-5/10');
    expect(partial.headers.get('content-length')).toBe('3');
    expect(await partial.text()).toBe('345');

    const unsatisfiable = await streamAdStudioMedia(storage, 'a/clip.mp4', 'bytes=20-');
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */10');

    expect((await streamAdStudioMedia(storage, 'a/missing.mp4', null)).status).toBe(404);
  });
});
