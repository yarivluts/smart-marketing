// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createAdStudioClip,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getAdStudioClip,
  inviteMemberToOrganization,
  listAdStudioClips,
  listAdStudioUsage,
  listAdStudioVideos,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { advanceBriefVideo, CLIP_TIMEOUT_MS, configureAdStudioRuntime, createMemoryMediaStorage, createOmniClient } from '@/lib/ad-studio/engine';
import { POST as createBrief } from './briefs/route';
import { DELETE as deleteBrief } from './briefs/[briefId]/route';
import { PUT as saveScript } from './briefs/[briefId]/script/route';
import { POST as renderScene } from './briefs/[briefId]/scenes/[sceneId]/render/route';
import { POST as editScene } from './briefs/[briefId]/scenes/[sceneId]/edit/route';
import { POST as renderAll } from './briefs/[briefId]/render-all/route';
import { GET as renderStatus } from './briefs/[briefId]/render-status/route';
import { POST as assemble } from './briefs/[briefId]/assemble/route';
import { GET as clipMedia } from './briefs/[briefId]/clips/[clipId]/media/route';
import { GET as videoMedia } from './briefs/[briefId]/videos/[videoId]/media/route';
import { PUT as putSettings } from './settings/route';

const { getServerSessionMock, memoryStorage, concatClipsMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  memoryStorage: { current: null as unknown },
  concatClipsMock: vi.fn(),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

type MemoryStorage = ReturnType<typeof createMemoryMediaStorage>;
const storage = () => memoryStorage.current as MemoryStorage;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  concatClipsMock.mockReset();
  memoryStorage.current = createMemoryMediaStorage();
  // The engine's test seams stand in for GCS and ffmpeg (the engine lives in @growthos/ad-studio).
  configureAdStudioRuntime({ mediaStorage: () => memoryStorage.current as MemoryStorage, concatClips: concatClipsMock });
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * A stand-in for Gemini Omni's HTTP API with the documented shapes: a background start returns
 * `in_progress`, the next interaction read is `completed` with the video in the model_output step,
 * the file is PROCESSING once and then ACTIVE, and the download returns bytes.
 */
function fakeOmni(options: { startStatus?: number; startMessage?: string; qa?: (n: number) => unknown } = {}) {
  const starts: Record<string, unknown>[] = [];
  const reviews: { parts: Record<string, unknown>[] }[] = [];
  const fileReads = new Map<string, number>();
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    expect(url.startsWith(BASE)).toBe(true);
    expect(url).not.toContain('test-gemini-key');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
    if (url === `${BASE}/interactions` && init?.method === 'POST') {
      if (options.startStatus) return new Response(JSON.stringify({ error: { message: options.startMessage ?? 'failed' } }), { status: options.startStatus });
      starts.push(JSON.parse(String(init.body)));
      return Response.json({ id: `v1_${starts.length}`, status: 'in_progress' });
    }
    if (url.endsWith(':generateContent') && options.qa) {
      const body = JSON.parse(String(init?.body)) as { contents: { parts: Record<string, unknown>[] }[] };
      reviews.push({ parts: body.contents[0].parts });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(options.qa(reviews.length)) }] } }] });
    }
    const interaction = /\/interactions\/(v1_\d+)$/.exec(url);
    if (interaction) {
      const n = interaction[1].slice(3);
      return Response.json({ id: interaction[1], status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri: `${BASE}/files/f${n}:download?alt=media` }] }] });
    }
    const download = /\/files\/(f\d+):download\?alt=media$/.exec(url);
    if (download) return new Response(Buffer.from(`mp4-bytes-of-${download[1]}`), { status: 200 });
    const file = /\/files\/(f\d+)$/.exec(url);
    if (file) {
      const reads = (fileReads.get(file[1]) ?? 0) + 1;
      fileReads.set(file[1], reads);
      return Response.json({ name: `files/${file[1]}`, state: reads > 1 ? 'ACTIVE' : 'PROCESSING' });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, starts, reviews };
}

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  const uid = unique('uid');
  await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  return { uid, email } as DecodedIdToken;
}

function request(method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const SCENES = [
  { id: 's1', durationSeconds: 5, visualPrompt: 'A lawyer at a desk', voiceover: 'Too much paper?', onScreenText: 'Paper?' },
  { id: 's2', durationSeconds: 8, visualPrompt: 'A phone showing a signature', voiceover: '', onScreenText: '' },
];

async function setup() {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Video Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const orgId = organization.id;
  const projectId = project.id;
  getServerSessionMock.mockResolvedValue(ownerSession);
  const created = await createBrief(
    request('POST', { name: 'Sign fast', objective: 'Trial signups', productDescription: 'E-signatures for lawyers', landingPageUrl: '', format: 'vertical', language: 'en', targetSeconds: 13 }),
    { params: Promise.resolve({ orgId, projectId }) },
  );
  const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
  expect((await saveScript(request('PUT', { scenes: SCENES }), { params: Promise.resolve({ orgId, projectId, briefId }) })).status).toBe(200);
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId, projectId, briefId, ...extra }) }) as never;
  return { ownerSession, owner, orgId, projectId, briefId, p };
}

type ClipJson = {
  id: string;
  sceneId: string;
  status: string;
  version: number;
  kind: string;
  failureReason: string | null;
  instruction: string | null;
  qa: { status: string; issues: { kind: string; severity: string; detail: string; atSeconds: number | null }[]; transcript: string | null } | null;
};
type Listing = { clips: ClipJson[]; videos: { id: string; status: string; durationSeconds: number; clipIds: string[] }[] };

async function poll(p: ReturnType<Awaited<ReturnType<typeof setup>>['p']>): Promise<Listing> {
  const response = await renderStatus(request('GET'), p);
  expect(response.status).toBe(200);
  return (await response.json()) as Listing;
}

describe('Ad Studio video routes (KAN-231)', () => {
  it('renders a scene: meters it, advances generating -> ready over polls, stores it privately and streams it with ranges', async () => {
    const ctx = await setup();
    const { starts } = fakeOmni();
    const started = await renderScene(request('POST'), ctx.p({ sceneId: 's1' }));
    expect(started.status).toBe(200);
    const body = (await started.json()) as Listing;
    expect(body.clips).toHaveLength(1);
    expect(body.clips[0]).toMatchObject({ sceneId: 's1', status: 'generating', version: 1, kind: 'render' });
    expect(starts[0]).toMatchObject({ model: 'gemini-omni-1.1-flash', background: true, response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p', delivery: 'uri' } });
    expect(String(starts[0].input)).toContain('[0-5s] A lawyer at a desk');
    expect(String(starts[0].input)).not.toContain('Paper?');
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId))[0]).toMatchObject({ kind: 'video_scene', units: 5, provider: 'gemini', model: 'gemini-omni-1.1-flash', outcome: 'succeeded' });

    // Poll 1: interaction completed, file still processing. Poll 2: file active, copied, ready.
    expect((await poll(ctx.p())).clips[0].status).toBe('generating');
    const clipId = body.clips[0].id;
    expect((await getAdStudioClip(ctx.orgId, ctx.projectId, ctx.briefId, clipId)).file_name).toBe('files/f1');
    const done = await poll(ctx.p());
    expect(done.clips[0]).toMatchObject({ status: 'ready' });
    const objectPath = `orgs/${ctx.orgId}/projects/${ctx.projectId}/briefs/${ctx.briefId}/clips/${clipId}.mp4`;
    expect(storage().objects.get(objectPath)?.data.toString()).toBe('mp4-bytes-of-f1');
    expect((await getAdStudioClip(ctx.orgId, ctx.projectId, ctx.briefId, clipId)).gcs_path).toBe(objectPath);

    const whole = await clipMedia(request('GET'), ctx.p({ clipId }));
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    expect(await whole.text()).toBe('mp4-bytes-of-f1');
    const partial = await clipMedia(request('GET', undefined, { range: 'bytes=0-2' }), ctx.p({ clipId }));
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe('mp4');
  });

  it('checks each ready clip with AI on a status poll: a clean clip passes, a stuttered one is marked with what was heard', async () => {
    const ctx = await setup();
    const verdicts = [
      { transcript: 'Too much paper?', issues: [] },
      {
        transcript: 'ma-ma Too much paper?',
        issues: [
          { kind: 'audio', severity: 'major', detail: 'Stutter on the first word', atSeconds: 0.2 },
          { kind: 'visual', severity: 'minor', detail: 'Slight blur', atSeconds: null },
        ],
      },
    ];
    const { reviews } = fakeOmni({ qa: (n) => verdicts[n - 1] });
    await renderScene(request('POST'), ctx.p({ sceneId: 's1' }));
    let listing = await poll(ctx.p());
    for (let i = 0; i < 3 && !listing.clips[0].qa; i += 1) listing = await poll(ctx.p());
    expect(listing.clips[0]).toMatchObject({ status: 'ready', qa: { status: 'passed', issues: [], transcript: 'Too much paper?' } });
    // The reviewer got the stored clip as video bytes, with the scene's narration in the prompt.
    expect(reviews[0].parts[0]).toEqual({ inlineData: { mimeType: 'video/mp4', data: Buffer.from('mp4-bytes-of-f1').toString('base64') } });
    expect(String(reviews[0].parts[1].text)).toContain('Intended narration, word for word: "Too much paper?"');
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId)).find((row) => row.kind === 'video_qa')).toMatchObject({ units: 1, outcome: 'succeeded' });
    // Later polls do not check the same clip again.
    await poll(ctx.p());
    expect(reviews).toHaveLength(1);

    await renderScene(request('POST'), ctx.p({ sceneId: 's1' }));
    for (let i = 0; i < 4; i += 1) listing = await poll(ctx.p());
    const newest = listing.clips.find((clip) => clip.version === 2) as ClipJson;
    expect(newest.qa).toMatchObject({
      status: 'issues',
      transcript: 'ma-ma Too much paper?',
      issues: [
        { kind: 'audio', severity: 'major', detail: 'Stutter on the first word', atSeconds: 0.2 },
        { kind: 'visual', severity: 'minor', detail: 'Slight blur', atSeconds: null },
      ],
    });
  });

  it('marks clips skipped when the project turns the check off, without calling the reviewer', async () => {
    const ctx = await setup();
    const { reviews } = fakeOmni({ qa: () => ({ transcript: '', issues: [] }) });
    const saved = await putSettings(request('PUT', { dailyTextGenerations: 50, dailyVideoSeconds: 300, videoQa: { enabled: false, retries: 1 } }), {
      params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId }),
    });
    expect(saved.status).toBe(200);
    await renderScene(request('POST'), ctx.p({ sceneId: 's1' }));
    let listing = await poll(ctx.p());
    for (let i = 0; i < 3 && !listing.clips[0].qa; i += 1) listing = await poll(ctx.p());
    expect(listing.clips[0].qa).toMatchObject({ status: 'skipped', issues: [] });
    expect(reviews).toHaveLength(0);
  });

  it('a depleted Gemini account is reported as provider_billing, the clip reads failed, and the usage is logged', async () => {
    const ctx = await setup();
    fakeOmni({ startStatus: 402, startMessage: 'Your prepayment credits are depleted.' });
    const response = await renderScene(request('POST'), ctx.p({ sceneId: 's2' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'provider_failed', code: 'provider_billing' });
    const [clip] = await listAdStudioClips(ctx.orgId, ctx.projectId, ctx.briefId);
    expect(clip).toMatchObject({ status: 'failed', failure_reason: 'provider_billing' });
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId))[0]).toMatchObject({ kind: 'video_scene', units: 8, outcome: 'failed', failure_reason: 'provider_billing' });
    expect((await poll(ctx.p())).clips[0]).toMatchObject({ status: 'failed', failureReason: 'provider_billing' });
  });

  it('the daily video-seconds limit refuses a render and a whole render-all batch before calling Gemini', async () => {
    const ctx = await setup();
    expect((await putSettings(request('PUT', { dailyTextGenerations: 10, dailyVideoSeconds: 10 }), { params: Promise.resolve({ orgId: ctx.orgId, projectId: ctx.projectId }) })).status).toBe(200);
    const { fetchMock } = fakeOmni();
    const all = await renderAll(request('POST'), ctx.p());
    expect(all.status).toBe(429);
    expect(await all.json()).toMatchObject({ error: 'quota_exceeded', limitKind: 'video', used: 0, limit: 10 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await renderScene(request('POST'), ctx.p({ sceneId: 's1' }))).status).toBe(200);
    const second = await renderScene(request('POST'), ctx.p({ sceneId: 's2' }));
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ used: 5, limit: 10 });
  });

  it('render-all starts every scene, refuses a second render while one is generating, and edits chain from the finished clip', async () => {
    const ctx = await setup();
    const { starts } = fakeOmni();
    const all = await renderAll(request('POST'), ctx.p());
    expect(all.status).toBe(200);
    expect(((await all.json()) as { started: number }).started).toBe(2);
    const again = await renderScene(request('POST'), ctx.p({ sceneId: 's1' }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'video_request', code: 'already_generating' });
    expect((await editScene(request('POST', { instruction: 'make it night' }), ctx.p({ sceneId: 's1' }))).status).toBe(409);

    await poll(ctx.p());
    const ready = await poll(ctx.p());
    expect(ready.clips.map((clip) => clip.status)).toEqual(['ready', 'ready']);

    expect((await editScene(request('POST', { instruction: '   ' }), ctx.p({ sceneId: 's1' }))).status).toBe(400);
    const edited = await editScene(request('POST', { instruction: 'make it night' }), ctx.p({ sceneId: 's1' }));
    expect(edited.status).toBe(200);
    const editClip = ((await edited.json()) as Listing).clips.find((clip) => clip.kind === 'edit');
    expect(editClip).toMatchObject({ sceneId: 's1', version: 2, status: 'generating', instruction: 'make it night' });
    expect(starts[2]).toMatchObject({ previous_interaction_id: 'v1_1', input: expect.stringContaining('make it night. Keep everything else the same.') });
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId))[0]).toMatchObject({ kind: 'video_edit', units: 5 });
  });

  it('assembles the current clips in script order, streams the result, and refuses once a scene changed', async () => {
    const ctx = await setup();
    fakeOmni();
    await renderAll(request('POST'), ctx.p());
    await poll(ctx.p());
    const listing = await poll(ctx.p());
    const bySceneClip = Object.fromEntries(listing.clips.map((clip) => [clip.sceneId, clip.id]));
    concatClipsMock.mockImplementation(async ({ clips, output }: { clips: { file: string; seconds: number }[]; output: string }) => {
      expect(clips.map((clip) => clip.seconds)).toEqual([5, 8]);
      await writeFile(output, Buffer.from('assembled-mp4'));
      return { durationSeconds: 12.97 };
    });
    const response = await assemble(request('POST'), ctx.p());
    expect(response.status).toBe(200);
    const { video } = (await response.json()) as { video: { id: string; status: string; durationSeconds: number; clipIds: string[] } };
    expect(video).toMatchObject({ status: 'ready', durationSeconds: 12.97, clipIds: [bySceneClip.s1, bySceneClip.s2] });
    const media = await videoMedia(request('GET'), ctx.p({ videoId: video.id }));
    expect(await media.text()).toBe('assembled-mp4');

    // Editing a scene's visual makes its clip out of date: nothing to assemble until it is re-rendered.
    await saveScript(request('PUT', { scenes: [{ ...SCENES[0], visualPrompt: 'A lawyer at night' }, SCENES[1]] }), ctx.p());
    const refused = await assemble(request('POST'), ctx.p());
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'video_request', code: 'not_ready' });
    // Only on-screen text changed: still current.
    await saveScript(request('PUT', { scenes: [{ ...SCENES[0], onScreenText: 'New caption' }, SCENES[1]] }), ctx.p());
    concatClipsMock.mockImplementation(async ({ output }: { output: string }) => {
      await writeFile(output, Buffer.from('again'));
      return { durationSeconds: 13 };
    });
    expect((await assemble(request('POST'), ctx.p())).status).toBe(200);
    expect(await listAdStudioVideos(ctx.orgId, ctx.projectId, ctx.briefId)).toHaveLength(2);
  });

  it('an ffmpeg failure marks the video failed with a code', async () => {
    const ctx = await setup();
    fakeOmni();
    await renderAll(request('POST'), ctx.p());
    await poll(ctx.p());
    await poll(ctx.p());
    const { FfmpegUnavailableError } = await import('@/lib/ad-studio/engine');
    concatClipsMock.mockRejectedValue(new FfmpegUnavailableError('ffmpeg was not found'));
    const response = await assemble(request('POST'), ctx.p());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'assembly_failed', code: 'ffmpeg_unavailable' });
    expect((await listAdStudioVideos(ctx.orgId, ctx.projectId, ctx.briefId))[0]).toMatchObject({ status: 'failed', failure_reason: 'ffmpeg_unavailable' });
  });

  it('a clip stuck generating past the timeout is given up on', async () => {
    const ctx = await setup();
    const clip = await createAdStudioClip({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefId: ctx.briefId,
      sceneId: 's1',
      sceneFingerprint: 'fp',
      kind: 'render',
      prompt: 'x',
      model: 'gemini-omni-1.1-flash',
      aspectRatio: '9:16',
      durationSeconds: 5,
      requestedBy: ctx.owner.id,
      now: new Date('2026-09-27T10:00:00Z'),
    });
    const omni = createOmniClient('k', { fetchImpl: vi.fn() });
    const result = await advanceBriefVideo(
      { organizationId: ctx.orgId, projectId: ctx.projectId, briefId: ctx.briefId },
      { omni, storage: storage(), runner: { ffmpegPath: 'ffmpeg', spawnImpl: vi.fn(), timeoutMs: 1 }, now: () => new Date(Date.parse('2026-09-27T10:00:00Z') + CLIP_TIMEOUT_MS + 1) },
    );
    expect(result.clips.find((entry) => entry.id === clip.id)).toMatchObject({ status: 'failed', failureReason: 'timed_out' });
  });

  it('gates media and generation on ai.use, and deleting the brief removes its stored files', async () => {
    const ctx = await setup();
    fakeOmni();
    const listing = (await (await renderScene(request('POST'), ctx.p({ sceneId: 's1' }))).json()) as Listing;
    await poll(ctx.p());
    await poll(ctx.p());
    const clipId = listing.clips[0].id;
    expect(storage().objects.size).toBe(1);

    const email = `${unique('viewer')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: ctx.orgId, email, role: 'viewer', invitedByUserId: ctx.owner.id });
    const viewerSession = await sessionFor(email);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email });
    await acceptInvite({ organizationId: ctx.orgId, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(viewerSession);
    expect([403, 404]).toContain((await clipMedia(request('GET'), ctx.p({ clipId }))).status);
    expect([403, 404]).toContain((await renderScene(request('POST'), ctx.p({ sceneId: 's2' }))).status);
    expect([403, 404]).toContain((await renderStatus(request('GET'), ctx.p())).status);

    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    expect((await clipMedia(request('GET'), ctx.p({ clipId: 'nope' }))).status).toBe(404);
    expect((await deleteBrief(request('DELETE'), ctx.p())).status).toBe(200);
    expect(storage().objects.size).toBe(0);
    expect(await listAdStudioClips(ctx.orgId, ctx.projectId, ctx.briefId)).toEqual([]);
  });

  it('with no Gemini key, generation says not_configured and the status poll still lists', async () => {
    const ctx = await setup();
    delete process.env.GEMINI_API_KEY;
    const response = await renderScene(request('POST'), ctx.p({ sceneId: 's1' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'provider_failed', code: 'not_configured' });
    expect(await poll(ctx.p())).toEqual({ clips: [], videos: [] });
  });
});
