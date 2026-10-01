// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getAdStudioBrief, listAdStudioUsage } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage, type AdStudioReferenceView } from '@/lib/ad-studio/engine';
import { POST as createBrief } from './briefs/route';
import { PUT as saveScript } from './briefs/[briefId]/script/route';
import { POST as renderScene } from './briefs/[briefId]/scenes/[sceneId]/render/route';
import { GET as listReferences, POST as addReference } from './briefs/[briefId]/references/route';
import { DELETE as deleteReference, PATCH as patchReference } from './briefs/[briefId]/references/[referenceId]/route';
import { GET as referenceMedia } from './briefs/[briefId]/references/[referenceId]/media/route';

const { getServerSessionMock, memoryStorage } = vi.hoisted(() => ({ getServerSessionMock: vi.fn(), memoryStorage: { current: null as unknown } }));
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
  configureAdStudioRuntime({ mediaStorage: () => memoryStorage.current as MemoryStorage });
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.PAGESPEED_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  delete process.env.PAGESPEED_API_KEY;
});

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

/** Google's APIs with their documented shapes: PageSpeed's final screenshot, the image model, and Omni. */
function fakeGoogle() {
  const omniStarts: Record<string, unknown>[] = [];
  const pageSpeed: URL[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')) {
      pageSpeed.push(new URL(url));
      return Response.json({ lighthouseResult: { audits: { 'final-screenshot': { details: { data: `data:image/jpeg;base64,${JPEG.toString('base64')}` } } } } });
    }
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (url === `${GEMINI}/interactions` && body.model === 'gemini-3.1-flash-image') {
      return Response.json({ id: 'img', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] });
    }
    if (url === `${GEMINI}/interactions`) {
      omniStarts.push(body);
      return Response.json({ id: `v1_${omniStarts.length}`, status: 'in_progress' });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { omniStarts, pageSpeed };
}

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function jsonRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
}

function uploadRequest(bytes: Buffer, fields: Record<string, string>): NextRequest {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)]), 'screen.png');
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest('http://localhost/api/test', { method: 'POST', body: form });
}

async function setup() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);
  const { organization } = await createOrganizationWithOwner({ name: 'Reference Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const orgId = organization.id;
  const projectId = project.id;
  const created = await createBrief(
    jsonRequest('POST', { name: 'Show the app', objective: 'Signups', productDescription: 'GrowthOS growth analytics', landingPageUrl: '', format: 'horizontal', language: 'en', targetSeconds: 10 }),
    { params: Promise.resolve({ orgId, projectId }) },
  );
  const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId, projectId, briefId, ...extra }) }) as never;
  return { orgId, projectId, briefId, p };
}

type Added = { reference: AdStudioReferenceView };

describe('Ad Studio reference images', () => {
  it('uploads a real app screenshot, serves it, and refuses a file that is not a PNG or JPEG', async () => {
    fakeGoogle();
    const ctx = await setup();
    const listed = (await (await listReferences(jsonRequest('GET'), ctx.p())).json()) as { references: unknown[]; capture: boolean; illustration: boolean };
    expect(listed).toEqual({ references: [], capture: false, illustration: true });

    const response = await addReference(uploadRequest(PNG, { label: 'Dashboard', description: 'The ad studio dashboard' }), ctx.p());
    expect(response.status).toBe(201);
    const { reference } = (await response.json()) as Added;
    expect(reference).toMatchObject({ source: 'upload', label: 'Dashboard', status: 'ready', mimeType: 'image/png', byteSize: PNG.length });
    const media = await referenceMedia(jsonRequest('GET'), ctx.p({ referenceId: reference.id }));
    expect(media.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await media.arrayBuffer()).equals(PNG)).toBe(true);

    const gif = await addReference(uploadRequest(Buffer.from('GIF89a....'), { label: 'Animated' }), ctx.p());
    expect(gif.status).toBe(400);
    expect(await gif.json()).toEqual({ error: 'reference_request', code: 'unsupported_image' });
    const unlabelled = await addReference(uploadRequest(PNG, { label: ' ' }), ctx.p());
    expect(await unlabelled.json()).toEqual({ error: 'reference_request', code: 'label_required' });
  });

  it('captures a public page only when capture is set up, and draws an illustration counted as an image', async () => {
    const google = fakeGoogle();
    const ctx = await setup();
    const screenshot = { source: 'screenshot', url: 'https://example.com/pricing', device: 'mobile', label: 'Pricing', description: 'The pricing page' };
    const off = await addReference(jsonRequest('POST', screenshot), ctx.p());
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ error: 'reference_request', code: 'capture_not_configured' });

    process.env.PAGESPEED_API_KEY = 'psi-key';
    expect((await addReference(jsonRequest('POST', { ...screenshot, url: 'file:///etc/passwd' }), ctx.p())).status).toBe(400);
    const captured = (await (await addReference(jsonRequest('POST', screenshot), ctx.p())).json()) as Added;
    expect(captured.reference).toMatchObject({ source: 'screenshot', status: 'ready', mimeType: 'image/jpeg', sourceUrl: 'https://example.com/pricing' });
    expect(google.pageSpeed[0].searchParams.get('strategy')).toBe('mobile');

    const drawn = (await (await addReference(jsonRequest('POST', { source: 'illustration', prompt: 'A phone showing a signed contract', aspectRatio: '9:16', label: 'Signed' }), ctx.p())).json()) as Added;
    expect(drawn.reference).toMatchObject({ source: 'illustration', status: 'ready', prompt: 'A phone showing a signed contract' });
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId)).filter((row) => row.kind === 'reference_image')).toEqual([expect.objectContaining({ outcome: 'succeeded' })]);
    const listed = (await (await listReferences(jsonRequest('GET'), ctx.p())).json()) as { references: AdStudioReferenceView[]; capture: boolean };
    expect(listed.capture).toBe(true);
    expect(listed.references.map((entry) => entry.label).sort()).toEqual(['Pricing', 'Signed']);
  });

  it('a scene renders with its attached screen, sent to the video model after the prompt; deleting the image detaches it', async () => {
    const google = fakeGoogle();
    const ctx = await setup();
    const { reference } = (await (await addReference(uploadRequest(PNG, { label: 'Dashboard', description: 'The ad studio dashboard' }), ctx.p())).json()) as Added;
    const renamed = await patchReference(jsonRequest('PATCH', { label: 'Home screen', description: 'The GrowthOS home dashboard' }), ctx.p({ referenceId: reference.id }));
    expect(((await renamed.json()) as Added).reference).toMatchObject({ label: 'Home screen' });

    const scene = { id: 's1', durationSeconds: 5, visualPrompt: 'A marketer looks at a laptop', voiceover: '', onScreenText: '', references: [{ imageId: reference.id, use: 'screen' }] };
    const unknown = await saveScript(jsonRequest('PUT', { scenes: [{ ...scene, references: [{ imageId: 'missing', use: 'screen' }] }] }), ctx.p());
    expect(await unknown.json()).toMatchObject({ error: 'invalid_script', issues: [{ code: 'unknown_reference', scene: 1 }] });
    expect((await saveScript(jsonRequest('PUT', { scenes: [scene] }), ctx.p())).status).toBe(200);

    expect((await renderScene(jsonRequest('POST'), ctx.p({ sceneId: 's1' }))).status).toBeLessThan(300);
    const [start] = google.omniStarts;
    const input = start.input as { type: string; text?: string; mime_type?: string; data?: string }[];
    expect(input).toHaveLength(2);
    expect(input[0].text).toContain('Attached image 1 is the real screen of the product (The GrowthOS home dashboard).');
    expect(input[1]).toEqual({ type: 'image', mime_type: 'image/png', data: PNG.toString('base64') });

    const deleted = await deleteReference(jsonRequest('DELETE'), ctx.p({ referenceId: reference.id }));
    expect(deleted.status).toBe(200);
    expect((await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId)).scenes[0]).not.toHaveProperty('references');
    expect([...(memoryStorage.current as MemoryStorage).objects.keys()].some((key) => key.includes('/references/'))).toBe(false);
  });
});
