// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  adStudioBriefMediaPrefix,
  adStudioClipObjectPath,
  adStudioVideoObjectPath,
  createLocalMediaStorage,
  resolveAdStudioMediaStorage,
} from './media-storage';


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
