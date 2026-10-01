// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getAdStudioBrief, listAdStudioUsage, saveAdStudioScript } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage, type AdStudioReferenceView } from '@/lib/ad-studio/engine';
import { POST as createBrief } from './briefs/route';
import { PUT as saveScript } from './briefs/[briefId]/script/route';
import { POST as renderScene } from './briefs/[briefId]/scenes/[sceneId]/render/route';
import { POST as renderAll } from './briefs/[briefId]/render-all/route';
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Google's APIs with their documented shapes: the text model (vocalizing), the image model and Omni. */
function fakeGoogle() {
  const omniStarts: Record<string, unknown>[] = [];
  const vocalizeCalls: { id: string; text: string }[][] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (url.endsWith(':generateContent')) {
      // The vocalizer: each line comes back with a vowel point added, standing in for the nikud.
      const prompt = (body.contents as { parts: { text: string }[] }[])[0].parts[0].text;
      const lines = JSON.parse(prompt.split('\n')[1]) as { id: string; text: string }[];
      vocalizeCalls.push(lines);
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines: lines.map((line) => ({ id: line.id, pronunciation: `${line.text}\u05b8` })) }) }] } }] });
    }
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
  return { omniStarts, vocalizeCalls };
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

describe('Hebrew nikud at render time', () => {
  it('adds nikud to Hebrew narration that has none right before a scene renders, and once for render-all', async () => {
    const google = fakeGoogle();
    const ctx = await setup();
    const plain = '\u05e9\u05dc\u05d5\u05dd';
    // Stored straight on the brief, as a script from before nikud would be: no pronunciation.
    const brief = await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId);
    brief.language = 'he';
    await brief.save();
    const scene = (id: string) => ({ id, durationSeconds: 5, visualPrompt: `Shot ${id}`, voiceover: plain, onScreenText: '' });
    await saveAdStudioScript({ organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId, scenes: [scene('s1'), scene('s2'), scene('s3')] });

    expect((await renderScene(jsonRequest('POST'), ctx.p({ sceneId: 's1' }))).status).toBeLessThan(300);
    expect(google.vocalizeCalls).toEqual([[{ id: 's1', text: plain }]]);
    expect(String(google.omniStarts[0].input)).toContain(`"${plain}\u05b8"`);

    expect((await renderAll(jsonRequest('POST'), ctx.p())).status).toBeLessThan(300);
    // One call for the two scenes still to render; s1 already has its nikud.
    expect(google.vocalizeCalls[1].map((line) => line.id)).toEqual(['s2', 's3']);
    expect(google.vocalizeCalls).toHaveLength(2);
    expect((await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId)).scenes.map((entry) => entry.pronunciation)).toEqual([`${plain}\u05b8`, `${plain}\u05b8`, `${plain}\u05b8`]);
    expect(google.omniStarts.slice(1).every((start) => String(start.input).includes('full nikud vowel marks'))).toBe(true);
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId)).filter((row) => row.kind === 'vocalize')).toHaveLength(2);
  });
});

describe('Ad Studio reference images', () => {
  it('uploads a real app screenshot, serves it, and refuses a file that is not a PNG or JPEG', async () => {
    fakeGoogle();
    const ctx = await setup();
    const listed = (await (await listReferences(jsonRequest('GET'), ctx.p())).json()) as { references: unknown[]; illustration: boolean };
    expect(listed).toEqual({ references: [], illustration: true });

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

  it('draws an illustration counted as an image, and refuses an unknown source', async () => {
    fakeGoogle();
    const ctx = await setup();
    const unknown = await addReference(jsonRequest('POST', { source: 'screenshot', url: 'https://example.com', label: 'Pricing' }), ctx.p());
    expect(unknown.status).toBe(400);

    const drawn = (await (await addReference(jsonRequest('POST', { source: 'illustration', prompt: 'A phone showing a signed contract', aspectRatio: '9:16', label: 'Signed' }), ctx.p())).json()) as Added;
    expect(drawn.reference).toMatchObject({ source: 'illustration', status: 'ready', prompt: 'A phone showing a signed contract' });
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId)).filter((row) => row.kind === 'reference_image')).toEqual([expect.objectContaining({ outcome: 'succeeded' })]);
    const listed = (await (await listReferences(jsonRequest('GET'), ctx.p())).json()) as { references: AdStudioReferenceView[] };
    expect(listed.references.map((entry) => entry.label)).toEqual(['Signed']);
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
