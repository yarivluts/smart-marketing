// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  getAdStudioUsageToday,
  inviteMemberToOrganization,
  listAdStudioExports,
  pushResourceAttachment,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { configureAdStudioRuntime, createMemoryMediaStorage, type AdStudioImageView, type AdStudioRunView } from '@/lib/ad-studio/engine';
import { POST as createBrief } from './briefs/route';
import { PUT as saveScript } from './briefs/[briefId]/script/route';
import { PUT as saveConcepts } from './briefs/[briefId]/image-concepts/route';
import { POST as generateConcepts } from './briefs/[briefId]/image-concepts/generate/route';
import { GET as listImages, POST as renderImage } from './briefs/[briefId]/images/route';
import { POST as editImage } from './briefs/[briefId]/images/[imageId]/edit/route';
import { POST as selectImage } from './briefs/[briefId]/images/[imageId]/select/route';
import { GET as imageMedia } from './briefs/[briefId]/images/[imageId]/media/route';
import { POST as exportImage } from './briefs/[briefId]/images/[imageId]/export/route';
import { GET as latestRun, POST as startRun } from './briefs/[briefId]/autopilot/route';
import { POST as advanceRun } from './briefs/[briefId]/autopilot/[runId]/advance/route';
import { POST as cancelRun } from './briefs/[briefId]/autopilot/[runId]/cancel/route';

const { getServerSessionMock, memoryStorage, concatClipsMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  memoryStorage: { current: null as unknown },
  concatClipsMock: vi.fn(),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));
// The route asks which environment the viewer picked (a cookie); the test has none, so the default applies.
vi.mock('@/lib/orgs/selected-environment', () => ({ resolveSelectedEnvironment: async () => ({ selected: null, environments: [] }) }));

type MemoryStorage = ReturnType<typeof createMemoryMediaStorage>;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  concatClipsMock.mockReset();
  concatClipsMock.mockImplementation(async ({ output }: { output: string }) => {
    await writeFile(output, 'assembled-video');
    return { durationSeconds: 13 };
  });
  memoryStorage.current = createMemoryMediaStorage();
  configureAdStudioRuntime({ mediaStorage: () => memoryStorage.current as MemoryStorage, concatClips: concatClipsMock });
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);

/**
 * A stand-in for the Google APIs the studio calls, with their documented shapes: Gemini text
 * (`generateContent`, answered by the JSON schema it was asked for), Gemini image (`interactions`,
 * synchronous, inline PNG), Gemini Omni video (`interactions` in the background, polled, then a
 * Files API download), and Google Ads OAuth + `assets:mutate` for an image export.
 */
function fakeGoogle(options: { imageStatus?: number; imageMessage?: string } = {}) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const fileReads = new Map<string, number>();
  let omniStarts = 0;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' && init.body.startsWith('{') ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'ads-token', expires_in: 3600 });
    if (url === 'https://googleads.googleapis.com/v25/customers/1234567890/assets:mutate') return Response.json({ results: [{ resourceName: 'customers/1234567890/assets/77' }] });
    expect(url.startsWith(BASE)).toBe(true);
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
    if (url.endsWith(':generateContent')) {
      const schema = JSON.stringify((body?.generationConfig as { responseJsonSchema?: unknown })?.responseJsonSchema ?? {});
      const answer = schema.includes('"concepts"')
        ? { concepts: [{ visualPrompt: 'A lawyer signing on a phone in a bright office', headline: 'Sign in 30 seconds', formats: ['square', 'story', 'landscape'] }] }
        : {
            title: 'Sign fast',
            scenes: [
              { durationSeconds: 5, visualPrompt: 'A lawyer at a desk buried in paper', voiceover: 'Too much paper?', onScreenText: '' },
              { durationSeconds: 8, visualPrompt: 'The lawyer signs on a phone in one tap', voiceover: 'Sign in seconds.', onScreenText: 'Try free' },
            ],
          };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    }
    if (url === `${BASE}/interactions` && body?.model === 'gemini-3.1-flash-image') {
      if (options.imageStatus) return new Response(JSON.stringify({ error: { message: options.imageMessage ?? 'failed' } }), { status: options.imageStatus });
      return Response.json({ id: 'img', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] });
    }
    if (url === `${BASE}/interactions`) {
      omniStarts += 1;
      return Response.json({ id: `v1_${omniStarts}`, status: 'in_progress' });
    }
    const interaction = /\/interactions\/(v1_\d+)$/.exec(url);
    if (interaction) {
      const n = interaction[1].slice(3);
      return Response.json({ id: interaction[1], status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri: `${BASE}/files/f${n}:download?alt=media` }] }] });
    }
    const download = /\/files\/(f\d+):download\?alt=media$/.exec(url);
    if (download) return new Response(Buffer.from(`mp4-${download[1]}`), { status: 200 });
    const file = /\/files\/(f\d+)$/.exec(url);
    if (file) {
      const reads = (fileReads.get(file[1]) ?? 0) + 1;
      fileReads.set(file[1], reads);
      return Response.json({ name: `files/${file[1]}`, state: reads > 1 ? 'ACTIVE' : 'PROCESSING' });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  const uid = unique('uid');
  await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  return { uid, email } as DecodedIdToken;
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function setup() {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Autopilot Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const orgId = organization.id;
  const projectId = project.id;
  getServerSessionMock.mockResolvedValue(ownerSession);
  const created = await createBrief(
    request('POST', { name: 'Sign fast', objective: 'Trial signups', productDescription: 'E-signatures for lawyers', landingPageUrl: '', format: 'vertical', language: 'en', targetSeconds: 13 }),
    { params: Promise.resolve({ orgId, projectId }) },
  );
  const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId, projectId, briefId, ...extra }) }) as never;
  return { ownerSession, owner, orgId, projectId, briefId, p };
}

type ImagesPayload = { concepts: { id: string; formats: string[] }[]; images: AdStudioImageView[] };

describe('image ads routes', () => {
  it('writes ideas with AI, renders one, changes it by an instruction, picks the older version and serves it', async () => {
    const google = fakeGoogle();
    const ctx = await setup();

    const ideas = (await (await generateConcepts(request('POST', { imageFormats: ['square', 'story'] }), ctx.p())).json()) as ImagesPayload;
    expect(ideas.concepts).toHaveLength(1);
    // The model also suggested landscape; the person asked only for square and story.
    expect(ideas.concepts[0].formats).toEqual(['square', 'story']);
    const conceptId = ideas.concepts[0].id;

    const rendered = (await (await renderImage(request('POST', { conceptId, format: 'story' }), ctx.p())).json()) as ImagesPayload;
    const first = rendered.images[0];
    expect(first).toMatchObject({ conceptId, format: 'story', status: 'ready', selected: true, version: 1 });
    const imageCall = google.calls.find((call) => call.url === `${BASE}/interactions`);
    expect(imageCall?.body).toMatchObject({ model: 'gemini-3.1-flash-image', response_format: { type: 'image', aspect_ratio: '9:16' } });
    expect(JSON.stringify(imageCall?.body)).toContain('Sign in 30 seconds');

    const edited = (await (await editImage(request('POST', { instruction: 'Warmer light' }), ctx.p({ imageId: first.id }))).json()) as ImagesPayload;
    const second = edited.images.find((image) => image.version === 2) as AdStudioImageView;
    expect(second).toMatchObject({ kind: 'edit', parentImageId: first.id, instruction: 'Warmer light', selected: true });
    const editCall = google.calls.filter((call) => call.url === `${BASE}/interactions`).at(-1);
    expect((editCall?.body?.input as { type: string }[]).map((item) => item.type)).toEqual(['text', 'image']);

    const picked = (await (await selectImage(request('POST'), ctx.p({ imageId: first.id }))).json()) as ImagesPayload;
    expect(picked.images.find((image) => image.id === first.id)?.selected).toBe(true);
    expect(picked.images.find((image) => image.id === second.id)?.selected).toBe(false);

    const media = await imageMedia(new NextRequest('http://localhost/api/test'), ctx.p({ imageId: first.id }));
    expect(media.status).toBe(200);
    expect(media.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await media.arrayBuffer())).toEqual(PNG);

    expect(await getAdStudioUsageToday(ctx.orgId, ctx.projectId)).toMatchObject({ images: 2, textGenerations: 1 });
  });

  it('saves edited ideas, refuses broken ones, and records a provider refusal on the image itself', async () => {
    fakeGoogle({ imageStatus: 400, imageMessage: 'Blocked by safety filters' });
    const ctx = await setup();
    const bad = await saveConcepts(request('PUT', { concepts: [{ id: 'c1', visualPrompt: ' ', headline: '', formats: [] }] }), ctx.p());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_concepts' });
    const saved = await saveConcepts(request('PUT', { concepts: [{ id: 'c1', visualPrompt: 'A phone', headline: '', formats: ['square'] }] }), ctx.p());
    expect(saved.status).toBe(200);

    const refused = (await (await renderImage(request('POST', { conceptId: 'c1', format: 'square' }), ctx.p())).json()) as ImagesPayload;
    expect(refused.images[0]).toMatchObject({ status: 'failed', failureCode: 'refused', selected: false });
    expect((await renderImage(request('POST', { conceptId: 'c1', format: 'story' }), ctx.p())).status).toBe(400);
    expect((await listImages(request('GET'), ctx.p())).status).toBe(200);
  });

  it('exports a ready image as a Google Ads image asset through the attached credential, and needs automation.execute', async () => {
    const google = fakeGoogle();
    const ctx = await setup();
    await saveConcepts(request('PUT', { concepts: [{ id: 'c1', visualPrompt: 'A phone', headline: 'Sign fast', formats: ['square'] }] }), ctx.p());
    const image = ((await (await renderImage(request('POST', { conceptId: 'c1', format: 'square' }), ctx.p())).json()) as ImagesPayload).images[0];

    const credential = await createSharedCredential({ organizationId: ctx.orgId, name: 'Google Ads', provider: 'google_ads', availableScopes: ['upload'], createdByUserId: ctx.owner.id });
    await setSharedCredentialSecret({
      organizationId: ctx.orgId,
      credentialId: credential.id,
      secret: JSON.stringify({ developerToken: 'dev', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', customerId: '1234567890' }),
      kms: getServerKmsProvider(),
      actorId: ctx.owner.id,
    });
    const attachment = await pushResourceAttachment({ organizationId: ctx.orgId, projectId: ctx.projectId, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: ctx.owner.id, scopeSelection: ['upload'] });
    await setResourceAttachmentWriteTier({ organizationId: ctx.orgId, attachmentId: attachment.id, tier: 'optimize', actorId: ctx.owner.id });

    const response = await exportImage(request('POST', { destination: 'google_ads', title: 'Sign fast - square' }), ctx.p({ imageId: image.id }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ export: { mediaKind: 'image', imageId: image.id, destination: 'google_ads', status: 'done', externalId: 'customers/1234567890/assets/77' } });
    const mutate = google.calls.find((call) => call.url.endsWith('/assets:mutate'));
    expect(mutate?.body).toEqual({ operations: [{ create: { name: 'Sign fast - square', imageAsset: { data: PNG.toString('base64') } } }] });
    expect((await listAdStudioExports(ctx.orgId, ctx.projectId, ctx.briefId))[0]).toMatchObject({ media_kind: 'image', status: 'done' });

    // An editor can make images but not send them to an ad platform.
    const email = `${unique('editor')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: ctx.orgId, email, role: 'editor', invitedByUserId: ctx.owner.id, projectId: ctx.projectId });
    const editorSession = await sessionFor(email);
    const editor = await ensureUserForFirebaseSession({ firebaseUid: editorSession.uid, email });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: invitation.id, userId: editor.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(editorSession);
    expect([403, 404]).toContain((await exportImage(request('POST', { destination: 'google_ads', title: 'x' }), ctx.p({ imageId: image.id }))).status);
  });
});

describe('autopilot routes', () => {
  async function drive(ctx: Awaited<ReturnType<typeof setup>>, runId: string): Promise<AdStudioRunView> {
    let run: AdStudioRunView | null = null;
    for (let call = 0; call < 40; call += 1) {
      const response = await advanceRun(request('POST'), ctx.p({ runId }));
      expect(response.status).toBe(200);
      run = ((await response.json()) as { run: AdStudioRunView }).run;
      if (run.status !== 'running') break;
    }
    return run as AdStudioRunView;
  }

  it('takes a bare brief to a script, image ideas, an image per placement, rendered scenes and the assembled video', async () => {
    fakeGoogle();
    const ctx = await setup();
    const started = await startRun(request('POST', { options: { plan: false, images: true, imageFormats: ['square', 'portrait'], video: true } }), ctx.p());
    expect(started.status).toBe(201);
    const { run } = (await started.json()) as { run: AdStudioRunView };
    // Only one run at a time per ad.
    expect((await startRun(request('POST', { options: {} }), ctx.p())).status).toBe(409);

    const finished = await drive(ctx, run.id);
    expect(finished.status).toBe('done');
    expect(finished.steps.map((step) => [step.id, step.status, step.reason])).toEqual([
      ['plan', 'skipped', 'off'],
      ['script', 'done', null],
      ['image_concepts', 'done', null],
      ['images', 'done', null],
      ['clips', 'done', null],
      ['assemble', 'done', null],
    ]);
    expect(finished.steps.find((step) => step.id === 'images')?.progress).toEqual({ done: 2, total: 2 });
    expect(concatClipsMock).toHaveBeenCalledTimes(1);

    // A second run keeps everything that exists and only reports it.
    const again = ((await (await startRun(request('POST', { options: { plan: false } }), ctx.p())).json()) as { run: AdStudioRunView }).run;
    const rerun = await drive(ctx, again.id);
    expect(rerun.steps.map((step) => step.status)).toEqual(['skipped', 'skipped', 'skipped', 'done', 'done', 'skipped']);
    expect(concatClipsMock).toHaveBeenCalledTimes(1);
    expect(((await (await latestRun(request('GET'), ctx.p())).json()) as { run: AdStudioRunView }).run.id).toBe(again.id);
  });

  it('keeps a script the person wrote and redoes only the image of an idea they changed', async () => {
    fakeGoogle();
    const ctx = await setup();
    await saveScript(request('PUT', { scenes: [{ id: 's1', durationSeconds: 5, visualPrompt: 'My own scene', voiceover: '', onScreenText: '' }] }), ctx.p());
    await saveConcepts(request('PUT', { concepts: [{ id: 'c1', visualPrompt: 'A phone', headline: 'Old', formats: ['square'] }, { id: 'c2', visualPrompt: 'A desk', headline: '', formats: ['square'] }] }), ctx.p());
    const first = ((await (await startRun(request('POST', { options: { plan: false, video: false } }), ctx.p())).json()) as { run: AdStudioRunView }).run;
    expect((await drive(ctx, first.id)).status).toBe('done');
    const before = ((await (await listImages(request('GET'), ctx.p())).json()) as ImagesPayload).images;
    expect(before).toHaveLength(2);

    await saveConcepts(request('PUT', { concepts: [{ id: 'c1', visualPrompt: 'A phone', headline: 'New headline', formats: ['square'] }, { id: 'c2', visualPrompt: 'A desk', headline: '', formats: ['square'] }] }), ctx.p());
    const second = ((await (await startRun(request('POST', { options: { plan: false, video: false } }), ctx.p())).json()) as { run: AdStudioRunView }).run;
    const done = await drive(ctx, second.id);
    expect(done.steps.find((step) => step.id === 'script')).toMatchObject({ status: 'skipped', reason: 'off' });
    const after = ((await (await listImages(request('GET'), ctx.p())).json()) as ImagesPayload).images;
    expect(after).toHaveLength(3);
    expect(after.filter((image) => image.conceptId === 'c1').map((image) => image.version).sort()).toEqual([1, 2]);
    expect(after.filter((image) => image.conceptId === 'c2')).toHaveLength(1);
  });

  it('stops at a spent image limit, and can be cancelled', async () => {
    fakeGoogle({ imageStatus: 402, imageMessage: 'Your prepayment credits are depleted.' });
    const ctx = await setup();
    await saveConcepts(request('PUT', { concepts: [{ id: 'c1', visualPrompt: 'A phone', headline: '', formats: ['square'] }] }), ctx.p());
    const run = ((await (await startRun(request('POST', { options: { plan: false, video: false } }), ctx.p())).json()) as { run: AdStudioRunView }).run;
    const finished = await drive(ctx, run.id);
    expect(finished.steps.find((step) => step.id === 'images')).toMatchObject({ status: 'failed', reason: 'provider_billing' });

    const another = ((await (await startRun(request('POST', { options: { plan: false, video: false } }), ctx.p())).json()) as { run: AdStudioRunView }).run;
    const cancelled = ((await (await cancelRun(request('POST'), ctx.p({ runId: another.id }))).json()) as { run: AdStudioRunView }).run;
    expect(cancelled.status).toBe('cancelled');
    expect(((await (await advanceRun(request('POST'), ctx.p({ runId: another.id }))).json()) as { run: AdStudioRunView }).run.status).toBe('cancelled');
  });
});
