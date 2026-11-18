// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  saveAdStudioScript,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage } from '@/lib/ad-studio/engine';
import { PATCH as patchSitePages, POST as scanSitePages } from './briefs/[briefId]/site-pages/route';
import { GET as sitePageMedia } from './briefs/[briefId]/site-pages/[pageId]/media/route';
import { POST as createScrollClip } from './briefs/[briefId]/scenes/[sceneId]/scroll-clip/route';
import { POST as assembleVideo } from './briefs/[briefId]/assemble/route';

const { getServerSessionMock, memoryStorage, concatClipsMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  memoryStorage: { current: null as unknown },
  concatClipsMock: vi.fn(),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

type MemoryStorage = ReturnType<typeof createMemoryMediaStorage>;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

async function tallPng(): Promise<Buffer> {
  return sharp({
    create: { width: 430, height: 1800, channels: 3, background: { r: 245, g: 247, b: 252 } },
  })
    .png()
    .toBuffer();
}

function fakeMp4(tag: string): Buffer {
  return Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from(`ftypisom-${tag}`)]);
}

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function jsonReq(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

function uploadReq(bytes: Buffer, fileName: string, fields: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)]), fileName);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new NextRequest('http://localhost/api/test', { method: 'POST', body: form });
}

beforeEach(async () => {
  getServerSessionMock.mockReset();
  concatClipsMock.mockReset();
  memoryStorage.current = createMemoryMediaStorage();
  const png = await tallPng();
  configureAdStudioRuntime({
    mediaStorage: () => memoryStorage.current as MemoryStorage,
    demoAddressCheck: async () => undefined,
    sitePageCapturer: async ({ urls }) =>
      urls.map((url) => ({
        url,
        title: url.includes('/pricing') ? 'Pricing & Plans' : 'Easy Sign Home',
        screenshot: png,
        links:
          url === 'https://easysign.example.com' || url === 'https://easysign.example.com/'
            ? [
                { url: 'https://easysign.example.com/pricing', text: 'Pricing & Plans' },
                { url: 'https://easysign.example.com/signatures', text: 'Digital Signatures' },
              ]
            : [],
      })),
    renderScrollingVideo: async ({ output, durationSeconds }) => {
      await writeFile(output, fakeMp4('scroll-rendered'));
      return { durationSeconds };
    },
    concatClips: concatClipsMock.mockImplementation(async ({ output }: { output: string }) => {
      await writeFile(output, fakeMp4('assembled'));
      return { durationSeconds: 14 };
    }),
  });
});

async function setup() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: unique('Org'), ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: unique('Proj') });
  const orgId = organization.id;
  const projectId = project.id;
  getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);

  const brief = await createAdStudioBrief({
    organizationId: orgId,
    projectId,
    createdByUserId: owner.id,
    input: {
      name: 'Digital Signature Ad',
      objective: 'More contracts signed online',
      productDescription: 'Fast e-signatures and clear team pricing',
      landingPageUrl: 'https://easysign.example.com',
      format: 'vertical',
      language: 'en',
      targetSeconds: 20,
    },
  });
  await saveAdStudioScript({
    organizationId: orgId,
    projectId,
    briefId: brief.id,
    scenes: [
      { id: 's1', visualPrompt: 'Lawyer opens contract on phone', voiceover: '', onScreenText: '', durationSeconds: 5 },
      { id: 's2', visualPrompt: 'Client signs in seconds', voiceover: '', onScreenText: '', durationSeconds: 5 },
    ],
  });

  return { orgId, projectId, briefId: brief.id };
}

describe('Ad Studio site-scroll API routes', () => {
  it('scans site pages, streams image & video media, updates selection, builds scene scroll clips, and weaves them into assembled video', async () => {
    const { orgId, projectId, briefId } = await setup();

    // 1. Scan homepage + ad-relevant internal product pages without credentials.
    const scanRes = await scanSitePages(jsonReq('POST'), {
      params: Promise.resolve({ orgId, projectId, briefId }),
    });
    expect(scanRes.status).toBe(200);
    const { sitePages } = (await scanRes.json()) as {
      sitePages: { id: string; url: string; selected: boolean; kind: string }[];
    };
    expect(sitePages.length).toBe(3);
    expect(sitePages[0]?.kind).toBe('home');
    const firstId = sitePages[0]!.id;

    // 2. Stream both PNG screenshot and scrolling MP4 video, and return 404 for unknown pageId.
    const imgRes = await sitePageMedia(
      new NextRequest(`http://localhost/api/test?kind=image`),
      { params: Promise.resolve({ orgId, projectId, briefId, pageId: firstId }) },
    );
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get('content-type')).toBe('image/png');

    const vidRes = await sitePageMedia(
      new NextRequest(`http://localhost/api/test?kind=video`),
      { params: Promise.resolve({ orgId, projectId, briefId, pageId: firstId }) },
    );
    expect(vidRes.status).toBe(200);
    expect(vidRes.headers.get('content-type')).toBe('video/mp4');

    const missingRes = await sitePageMedia(
      new NextRequest(`http://localhost/api/test?kind=image`),
      { params: Promise.resolve({ orgId, projectId, briefId, pageId: 'missing-id' }) },
    );
    expect(missingRes.status).toBe(404);

    // 3. Toggle selection via PATCH so only the first page is woven automatically.
    const patchRes = await patchSitePages(jsonReq('PATCH', { selectedPageIds: [firstId] }), {
      params: Promise.resolve({ orgId, projectId, briefId }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { sitePages: { id: string; selected: boolean }[] };
    expect(patched.sitePages.filter((p) => p.selected).map((p) => p.id)).toEqual([firstId]);

    // 4. Create scene scroll clips: (a) from scanned sitePageId on s1, (b) from uploaded PNG on s2.
    const s1Res = await createScrollClip(jsonReq('POST', { sitePageId: firstId }), {
      params: Promise.resolve({ orgId, projectId, briefId, sceneId: 's1' }),
    });
    expect(s1Res.status).toBe(200);
    const s1Body = (await s1Res.json()) as { clip: { chosen?: boolean; kind: string; status: string } };
    expect(s1Body.clip.chosen).toBe(true);
    expect(s1Body.clip.kind).toBe('upload');

    const png = await tallPng();
    const s2Res = await createScrollClip(
      uploadReq(png, 'product-page.png', { alsoSaveToGallery: 'true' }),
      { params: Promise.resolve({ orgId, projectId, briefId, sceneId: 's2' }) },
    );
    expect(s2Res.status).toBe(200);
    const s2Body = (await s2Res.json()) as { clip: { chosen?: boolean; status: string } };
    expect(s2Body.clip.chosen).toBe(true);
    expect(s2Body.clip.status).toBe('ready');

    // 5. Assemble the full video and verify the selected scrolling page clip is spliced after scene 1.
    const assembleRes = await assembleVideo(jsonReq('POST'), {
      params: Promise.resolve({ orgId, projectId, briefId }),
    });
    expect(assembleRes.status).toBe(200);
    const passedClips = concatClipsMock.mock.calls[0]?.[0]?.clips as { file: string }[] | undefined;
    expect(passedClips).toHaveLength(3);
    expect(passedClips?.[1]?.file).toContain(`site-scroll-${firstId}`);
  });
});
