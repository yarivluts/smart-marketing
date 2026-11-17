// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import sharp from 'sharp';
import {
  createAdStudioBrief,
  createAdStudioDemoRecording,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  markAdStudioDemoRecordingReady,
  saveAdStudioImageConcepts,
  saveAdStudioScript,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage } from '@/lib/ad-studio/engine';
import { GET as listGallery, POST as uploadGallery } from './gallery/route';
import { DELETE as deleteGalleryItem, PATCH as patchGalleryItem } from './gallery/[assetId]/route';
import { GET as galleryMedia } from './gallery/[assetId]/media/route';
import { GET as segmentFrame } from './demo-recordings/[recordingId]/segments/[segmentId]/frame/route';
import { POST as uploadSceneClip } from './briefs/[briefId]/scenes/[sceneId]/upload-clip/route';
import { POST as attachSceneImage } from './briefs/[briefId]/scenes/[sceneId]/attach-image/route';
import { POST as uploadBriefImage } from './briefs/[briefId]/images/upload/route';

const { getServerSessionMock, memoryStorage } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  memoryStorage: { current: null as unknown },
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

type MemoryStorage = ReturnType<typeof createMemoryMediaStorage>;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  memoryStorage.current = createMemoryMediaStorage();
  configureAdStudioRuntime({
    mediaStorage: () => memoryStorage.current as MemoryStorage,
    normalizeVideo: async ({ bytes }) => bytes,
  });
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function samplePng(): Promise<Buffer> {
  return sharp({
    create: { width: 120, height: 80, channels: 3, background: { r: 30, g: 140, b: 210 } },
  })
    .png()
    .toBuffer();
}

function fakeMp4Bytes(): Buffer {
  return Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypisom\x00\x00\x02\x00isommp41')]);
}

function uploadRequest(bytes: Buffer, fileName: string, fields: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)]), fileName);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest('http://localhost/api/test', { method: 'POST', body: form });
}

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function setup() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: unique('Org'), ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: unique('Project') });
  const orgId = organization.id;
  const projectId = project.id;
  getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);

  const brief = await createAdStudioBrief({
    organizationId: orgId,
    projectId,
    createdByUserId: owner.id,
    input: {
      name: 'Gallery Ad Test',
      objective: 'signups',
      productDescription: 'Smart SaaS CRM',
      landingPageUrl: 'https://example.com',
      format: 'vertical',
      language: 'en',
      targetSeconds: 15,
    },
  });
  await saveAdStudioScript({
    organizationId: orgId,
    projectId,
    briefId: brief.id,
    scenes: [
      {
        id: 'scene-1',
        visualPrompt: 'Team working together',
        voiceover: 'Save hours weekly',
        onScreenText: 'Save hours weekly',
        durationSeconds: 5,
      },
    ],
  });
  await saveAdStudioImageConcepts({
    organizationId: orgId,
    projectId,
    briefId: brief.id,
    concepts: [
      { id: 'c1', visualPrompt: 'Product hero', headline: 'Grow Faster', formats: ['square', 'portrait'] },
    ],
  });

  return { orgId, projectId, briefId: brief.id, ownerId: owner.id };
}

describe('ad studio gallery & custom media routes', () => {
  it('uploads, lists, renames, streams, and deletes project gallery items and rejects invalid bytes', async () => {
    const { orgId, projectId } = await setup();
    const png = await samplePng();
    const mp4 = fakeMp4Bytes();

    const imgRes = await uploadGallery(uploadRequest(png, 'hero-shot.png', { description: 'Landing view' }), {
      params: Promise.resolve({ orgId, projectId }),
    });
    expect(imgRes.status).toBe(201);
    const { item: imgItem } = await imgRes.json();
    expect(imgItem.kind).toBe('image');
    expect(imgItem.label).toBe('hero shot');

    const vidRes = await uploadGallery(uploadRequest(mp4, 'demo-clip.mp4'), {
      params: Promise.resolve({ orgId, projectId }),
    });
    expect(vidRes.status).toBe(201);
    const { item: vidItem } = await vidRes.json();
    expect(vidItem.kind).toBe('video');

    const badRes = await uploadGallery(uploadRequest(Buffer.from('not-media'), 'bad.txt'), {
      params: Promise.resolve({ orgId, projectId }),
    });
    expect(badRes.status).toBe(400);
    expect(await badRes.json()).toEqual({ error: 'gallery_request', code: 'unsupported_media' });

    const listRes = await listGallery(new NextRequest('http://localhost/api/test'), {
      params: Promise.resolve({ orgId, projectId }),
    });
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed.items).toHaveLength(2);

    const mediaRes = await galleryMedia(new NextRequest('http://localhost/api/test'), {
      params: Promise.resolve({ orgId, projectId, assetId: imgItem.assetId }),
    });
    expect(mediaRes.status).toBe(200);
    expect(mediaRes.headers.get('content-type')).toBe('image/png');

    const patchRes = await patchGalleryItem(jsonRequest('PATCH', { label: 'Updated title' }), {
      params: Promise.resolve({ orgId, projectId, assetId: imgItem.assetId }),
    });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).item.label).toBe('Updated title');

    const delRes = await deleteGalleryItem(new NextRequest('http://localhost/api/test', { method: 'DELETE' }), {
      params: Promise.resolve({ orgId, projectId, assetId: vidItem.assetId }),
    });
    expect(delRes.status).toBe(200);
  });

  it('serves walkthrough segment keyframes and allows inserting uploaded or scanned media into scenes and image ads', async () => {
    const { orgId, projectId, briefId, ownerId } = await setup();
    const png = await samplePng();
    const mp4 = fakeMp4Bytes();
    const storage = memoryStorage.current as MemoryStorage;

    const rec = await createAdStudioDemoRecording({
      organizationId: orgId,
      projectId,
      site: 'app.example.com',
      requestedBy: ownerId,
    });
    const recPath = `orgs/${orgId}/projects/${projectId}/demo/${rec.id}.mp4`;
    const framePath = `orgs/${orgId}/projects/${projectId}/demo-recordings/${rec.id}/segment-seg-1.jpg`;
    await storage.upload(recPath, mp4, 'video/mp4');
    await storage.upload(framePath, png, 'image/jpeg');
    await markAdStudioDemoRecordingReady(rec, {
      gcsPath: recPath,
      durationSeconds: 8,
      segments: [
        {
          id: 'seg-1',
          title: 'Analytics board',
          description: 'Live chart',
          startSeconds: 1,
          endSeconds: 5,
          selected: true,
          frameGcsPath: framePath,
        },
      ],
    });

    const frameRes = await segmentFrame(new NextRequest('http://localhost/api/test'), {
      params: Promise.resolve({ orgId, projectId, recordingId: rec.id, segmentId: 'seg-1' }),
    });
    expect(frameRes.status).toBe(200);
    expect(frameRes.headers.get('content-type')).toBe('image/jpeg');

    const clipRes = await uploadSceneClip(
      jsonRequest('POST', { source: { type: 'demo_segment', recordingId: rec.id, segmentId: 'seg-1' } }),
      { params: Promise.resolve({ orgId, projectId, briefId, sceneId: 'scene-1' }) },
    );
    expect(clipRes.status).toBe(200);
    const clipBody = await clipRes.json();
    expect(clipBody.clips.some((c: { kind: string; chosen: boolean }) => c.kind === 'upload' && c.chosen)).toBe(true);

    const attachRes = await attachSceneImage(
      uploadRequest(png, 'mobile-screen.png', { use: 'screen', alsoSaveToGallery: 'true' }),
      { params: Promise.resolve({ orgId, projectId, briefId, sceneId: 'scene-1' }) },
    );
    expect(attachRes.status).toBe(200);
    const attachBody = await attachRes.json();
    expect(attachBody.reference.status).toBe('ready');
    expect(attachBody.scenes[0].references[0].imageId).toBe(attachBody.reference.id);

    const imageUploadRes = await uploadBriefImage(
      uploadRequest(png, 'new-ad.png', { format: 'square', headline: 'Start Free Trial' }),
      { params: Promise.resolve({ orgId, projectId, briefId }) },
    );
    expect(imageUploadRes.status).toBe(200);
    const imageBody = await imageUploadRes.json();
    expect(imageBody.concepts).toHaveLength(2);
    expect(imageBody.image.kind).toBe('upload');
    expect(imageBody.image.selected).toBe(true);
  });
});
