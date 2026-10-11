// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  inviteMemberToOrganization,
  listAdStudioUsage,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET as listBriefs, POST as createBrief } from './briefs/route';
import { PATCH as patchBrief, DELETE as deleteBrief } from './briefs/[briefId]/route';
import { PUT as saveScript } from './briefs/[briefId]/script/route';
import { POST as generateScript } from './briefs/[briefId]/script/generate/route';
import { POST as rewriteScene } from './briefs/[briefId]/scenes/[sceneId]/rewrite/route';
import { PUT as putSettings } from './settings/route';
import { POST as vocalize } from './briefs/[briefId]/vocalize/route';
import { POST as generateConcepts } from './briefs/[briefId]/image-concepts/generate/route';
import { PUT as saveCopy } from './briefs/[briefId]/copy/route';
import { POST as writeCopy } from './briefs/[briefId]/copy/generate/route';
import { PUT as saveVoice } from './briefs/[briefId]/voice/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  const uid = unique('uid');
  await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  return { uid, email } as DecodedIdToken;
}

async function setup() {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Studio Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, orgId: organization.id, projectId: project.id };
}

async function memberSession(orgId: string, projectId: string, role: 'project_admin' | 'editor' | 'viewer', invitedBy: string): Promise<DecodedIdToken> {
  const email = `${unique(role)}@example.com`;
  const invitation = await inviteMemberToOrganization({ organizationId: orgId, email, role, invitedByUserId: invitedBy, ...(role === 'viewer' ? {} : { projectId }) });
  const session = await sessionFor(email);
  const user = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId: orgId, membershipId: invitation.id, userId: user.id, callerEmailVerified: true });
  return session;
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
}

const BRIEF = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: 'https://example.com/lawyers',
  format: 'vertical',
  language: 'en',
  targetSeconds: 30,
};

function geminiReplies(...texts: (string | { status: number; message: string })[]) {
  const fetchMock = vi.fn(async () => {
    const next = texts.shift() ?? '{}';
    if (typeof next !== 'string') return new Response(JSON.stringify({ error: { message: next.message } }), { status: next.status });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: next }] } }] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function createBriefAs(session: DecodedIdToken, orgId: string, projectId: string) {
  getServerSessionMock.mockResolvedValue(session);
  const response = await createBrief(request('POST', BRIEF), { params: Promise.resolve({ orgId, projectId }) });
  expect(response.status).toBe(201);
  return ((await response.json()) as { brief: { id: string } }).brief.id;
}

describe('Ad Studio routes', () => {
  it('a project admin creates a brief, the AI writes a script fitted to 60 seconds, and the usage is logged', async () => {
    const { ownerSession, owner, orgId, projectId } = await setup();
    const adminSession = await memberSession(orgId, projectId, 'project_admin', owner.id);
    const briefId = await createBriefAs(adminSession, orgId, projectId);

    // The model ignores the limit: 7 scenes of 10 seconds.
    const scenes = Array.from({ length: 7 }, (_, index) => ({ durationSeconds: 10, visualPrompt: `Shot ${index}`, voiceover: '', onScreenText: '' }));
    geminiReplies(JSON.stringify({ title: 'Ad', scenes }));
    const generated = await generateScript(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(generated.status).toBe(200);
    const { brief } = (await generated.json()) as { brief: { scenes: { durationSeconds: number }[]; status: string; scriptGeneratedBy: { provider: string } } };
    expect(brief.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0)).toBeLessThanOrEqual(60);
    expect(brief).toMatchObject({ status: 'scripted', scriptGeneratedBy: { provider: 'gemini' } });
    expect((await listAdStudioUsage(orgId, projectId))[0]).toMatchObject({ kind: 'script', provider: 'gemini', outcome: 'succeeded' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const listed = (await (await listBriefs(request('GET'), { params: Promise.resolve({ orgId, projectId }) })).json()) as { briefs: { id: string }[] };
    expect(listed.briefs.map((entry) => entry.id)).toEqual([briefId]);
  });

  it('a person saves an edited script only when it keeps every rule, and gets each broken rule back', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    const briefId = await createBriefAs(ownerSession, orgId, projectId);
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    const bad = await saveScript(request('PUT', { scenes: [{ id: 'a', durationSeconds: 12, visualPrompt: '', voiceover: '', onScreenText: '' }] }), params);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_script', issues: [{ code: 'scene_too_long', scene: 1 }, { code: 'empty_visual_prompt', scene: 1 }] });

    const good = await saveScript(request('PUT', { scenes: [{ id: 'a', durationSeconds: 8, visualPrompt: 'A desk', voiceover: 'Hi', onScreenText: '' }] }), params);
    expect(good.status).toBe(200);
    expect((await getAdStudioBrief(orgId, projectId, briefId)).scenes).toEqual([{ id: 'a', durationSeconds: 8, visualPrompt: 'A desk', voiceover: 'Hi', onScreenText: '' }]);

    const patched = await patchBrief(request('PATCH', { ...BRIEF, targetSeconds: 70 }), params);
    expect(patched.status).toBe(400);
    expect(await patched.json()).toMatchObject({ error: 'invalid_brief' });
  });

  it('Hebrew narration is vocalized when saved and generated, kept while it stands, redone once it changes, and never blocks a save', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    getServerSessionMock.mockResolvedValue(ownerSession);
    const created = await createBrief(request('POST', { ...BRIEF, language: 'he' }), { params: Promise.resolve({ orgId, projectId }) });
    const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    // Hebrew as escapes (no Hebrew in code files): a word, and the same word with nikud.
    const plain = '\u05e9\u05dc\u05d5\u05dd';
    const vocalized = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';
    const scene = (voiceover: string, pronunciation?: string) => ({ id: 'a', durationSeconds: 5, visualPrompt: 'A desk', voiceover, onScreenText: '', ...(pronunciation ? { pronunciation } : {}) });
    const vocalizations = () => listAdStudioUsage(orgId, projectId).then((rows) => rows.filter((row) => row.kind === 'vocalize'));

    // The vocalizer answers with the nikud form of whatever lines it is sent.
    const vocalizer = vi.fn(async (_url: string, init: RequestInit) => {
      const prompt = (JSON.parse(String(init.body)) as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text;
      expect(prompt).toContain('Lines to vocalize');
      const lines = JSON.parse(prompt.split('\n')[1]) as { id: string; text: string }[];
      const answer = { lines: lines.map((line) => ({ id: line.id, pronunciation: line.text.split(plain).join(vocalized) })) };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', vocalizer);
    const saved = await saveScript(request('PUT', { scenes: [scene(plain), { ...scene(''), id: 'b' }] }), params);
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { brief: { scenes: { pronunciation?: string }[] } }).brief.scenes.map((entry) => entry.pronunciation)).toEqual([vocalized, undefined]);
    expect(vocalizer).toHaveBeenCalledTimes(1);
    expect(await vocalizations()).toEqual([expect.objectContaining({ outcome: 'succeeded', provider: 'gemini' })]);

    // Saved again as it stands: nothing to vocalize, no call.
    expect((await saveScript(request('PUT', { scenes: [scene(plain, vocalized)] }), params)).status).toBe(200);
    expect(vocalizer).toHaveBeenCalledTimes(1);

    // The narration changed under an unchanged pronunciation and the model is out of credit: saved, without it.
    geminiReplies({ status: 402, message: 'Your prepayment credits are depleted.' });
    expect((await saveScript(request('PUT', { scenes: [scene(`${plain} ${plain}`, vocalized)] }), params)).status).toBe(200);
    expect((await getAdStudioBrief(orgId, projectId, briefId)).scenes[0]).toEqual(scene(`${plain} ${plain}`));
    expect((await vocalizations()).map((row) => row.outcome).sort()).toEqual(['failed', 'succeeded']);

    // A generated script comes back vocalized: the script call, then the vocalizer.
    const generatedScene = { durationSeconds: 5, visualPrompt: 'A phone', voiceover: `${plain} 2`, onScreenText: '' };
    const script = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Ad', scenes: [generatedScene] }) }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => (String(init.body).includes('Lines to vocalize') ? vocalizer(url, init) : script())));
    const generated = await generateScript(request('POST'), params);
    expect(generated.status).toBe(200);
    expect(((await generated.json()) as { brief: { scenes: { pronunciation?: string }[] } }).brief.scenes[0].pronunciation).toBe(`${vocalized} 2`);
  });

  it('ad copy: ideas come with it, the AI fills only what is missing in one call, a person edits it within the limits', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    const briefId = await createBriefAs(ownerSession, orgId, projectId);
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    await saveScript(request('PUT', { scenes: [{ id: 's1', durationSeconds: 5, visualPrompt: 'A lawyer signs on a phone', voiceover: 'Sign in seconds', onScreenText: '' }] }), params);
    type Brief = { videoCopy: unknown; imageConcepts: { id: string; copy?: unknown }[] };

    const ideaCopy = { headline: 'Sign in 30 seconds', primaryText: 'Upload, send, signed.', description: 'Start free' };
    geminiReplies(
      JSON.stringify({
        concepts: [
          { visualPrompt: 'A phone with a green check', headline: '', formats: ['square'], copy: ideaCopy },
          { visualPrompt: 'A desk without paper', headline: '', formats: ['square'] },
        ],
      }),
    );
    const ideas = (await (await generateConcepts(request('POST', {}), params)).json()) as { concepts: { id: string; copy?: unknown }[] };
    expect(ideas.concepts.map((concept) => concept.copy ?? null)).toEqual([ideaCopy, null]);
    const [first, second] = ideas.concepts.map((concept) => concept.id);

    // One call writes the video's copy and the second idea's; the first idea keeps its own.
    const fetchMock = geminiReplies(
      JSON.stringify({
        items: [
          { key: 'video', headline: 'E-sign for lawyers, a much longer headline than allowed', primaryText: 'Clients sign from WhatsApp.', description: '' },
          { key: second, headline: 'No more paper', primaryText: 'Every contract signed online.', description: 'Try it free' },
        ],
      }),
    );
    const written = (await (await writeCopy(request('POST', {}), params)).json()) as { brief: Brief };
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(sent).toContain('\\"key\\":\\"video\\"');
    expect(sent).not.toContain(first);
    expect(written.brief.videoCopy).toEqual({ headline: 'E-sign for lawyers, a much', primaryText: 'Clients sign from WhatsApp.', description: '' });
    expect(written.brief.imageConcepts.map((concept) => (concept.copy as { headline: string } | undefined)?.headline)).toEqual(['Sign in 30 seconds', 'No more paper']);
    expect((await listAdStudioUsage(orgId, projectId)).filter((row) => row.kind === 'ad_copy')).toHaveLength(1);

    // Nothing missing: no call.
    const idle = geminiReplies();
    expect((await writeCopy(request('POST', {}), params)).status).toBe(200);
    expect(idle).not.toHaveBeenCalled();

    const tooLong = await saveCopy(request('PUT', { conceptCopies: { [first]: { headline: 'x'.repeat(31), primaryText: '', description: '' } } }), params);
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: 'invalid_copy', issues: [{ code: 'copy_headline_too_long', target: first }] });
    const edited = (await (await saveCopy(request('PUT', { videoCopy: null, conceptCopies: { [first]: { headline: 'Signed. Done.', primaryText: 'x', description: '' } } }), params)).json()) as { brief: Brief };
    expect(edited.brief.videoCopy).toBeNull();
    expect(edited.brief.imageConcepts[0].copy).toEqual({ headline: 'Signed. Done.', primaryText: 'x', description: '' });
  });

  it('adds nikud to a typed narration on request without saving it, for Hebrew ads only', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    getServerSessionMock.mockResolvedValue(ownerSession);
    const created = await createBrief(request('POST', { ...BRIEF, language: 'he' }), { params: Promise.resolve({ orgId, projectId }) });
    const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    const plain = '\u05e9\u05dc\u05d5\u05dd';
    const fetchMock = geminiReplies(JSON.stringify({ lines: [{ id: 'line', pronunciation: `${plain}\u05b8` }] }));
    const response = await vocalize(request('POST', { text: ` ${plain}  ` }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pronunciation: `${plain}\u05b8` });
    expect(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain(`\\"text\\":\\"${plain}\\"`);
    expect((await getAdStudioBrief(orgId, projectId, briefId)).scenes).toEqual([]);
    expect((await listAdStudioUsage(orgId, projectId)).filter((row) => row.kind === 'vocalize')).toHaveLength(1);

    expect((await vocalize(request('POST', { text: '  ' }), params)).status).toBe(400);
    const english = await createBriefAs(ownerSession, orgId, projectId);
    const refused = await vocalize(request('POST', { text: 'Sign fast' }), { params: Promise.resolve({ orgId, projectId, briefId: english }) });
    expect(await refused.json()).toMatchObject({ error: 'provider_failed', code: 'invalid_output' });
  });

  it('sets one narrator voice for the ad, refuses an invalid one by code, and clears it', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    const briefId = await createBriefAs(ownerSession, orgId, projectId);
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    const saved = await saveVoice(request('PUT', { voice: { preset: 'custom', description: '  an older   man ' } }), params);
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { brief: { voice: unknown } }).brief.voice).toEqual({ preset: 'custom', description: 'an older man' });
    const bad = await saveVoice(request('PUT', { voice: { preset: 'robot' } }), params);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_voice', code: 'unknown_voice' });
    expect((await saveVoice(request('PUT', {}), params)).status).toBe(400);
    const cleared = await saveVoice(request('PUT', { voice: null }), params);
    expect(((await cleared.json()) as { brief: { voice: unknown } }).brief.voice).toBeNull();
    expect((await getAdStudioBrief(orgId, projectId, briefId)).narrator_voice).toBeNull();
  });

  it('a scene rewrite is a proposal: returned with the same id, the saved script untouched', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    const briefId = await createBriefAs(ownerSession, orgId, projectId);
    await saveScript(request('PUT', { scenes: [{ id: 's1', durationSeconds: 5, visualPrompt: 'Old shot', voiceover: '', onScreenText: '' }] }), { params: Promise.resolve({ orgId, projectId, briefId }) });
    geminiReplies(JSON.stringify({ durationSeconds: 5, visualPrompt: 'New energetic shot', voiceover: 'Go', onScreenText: '' }));
    const response = await rewriteScene(request('POST', { instruction: 'more energy' }), { params: Promise.resolve({ orgId, projectId, briefId, sceneId: 's1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ scene: { id: 's1', durationSeconds: 5, visualPrompt: 'New energetic shot', voiceover: 'Go', onScreenText: '' } });
    expect((await getAdStudioBrief(orgId, projectId, briefId)).scenes[0].visualPrompt).toBe('Old shot');
  });

  it('a provider billing failure is reported by code and still logged; a spent daily limit refuses without calling the provider', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    const briefId = await createBriefAs(ownerSession, orgId, projectId);
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    geminiReplies({ status: 402, message: 'Your prepayment credits are depleted.' });
    const failed = await generateScript(request('POST'), params);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'provider_failed', code: 'provider_billing' });
    expect((await listAdStudioUsage(orgId, projectId))[0]).toMatchObject({ outcome: 'failed', failure_reason: 'provider_billing' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    expect((await putSettings(request('PUT', { dailyTextGenerations: 1, dailyVideoSeconds: 60 }), { params: Promise.resolve({ orgId, projectId }) })).status).toBe(200);
    const fetchMock = geminiReplies('{}');
    const refused = await generateScript(request('POST'), params);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: 'quota_exceeded', limitKind: 'text', used: 1, limit: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with no provider key the generator says not_configured', async () => {
    const { ownerSession, orgId, projectId } = await setup();
    const briefId = await createBriefAs(ownerSession, orgId, projectId);
    delete process.env.GEMINI_API_KEY;
    const response = await generateScript(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'provider_failed', code: 'not_configured' });
  });

  it('gates: a viewer cannot use the studio, an editor can but cannot change the limits, and delete works for the author', async () => {
    const { owner, orgId, projectId } = await setup();
    const viewer = await memberSession(orgId, projectId, 'viewer', owner.id);
    getServerSessionMock.mockResolvedValue(viewer);
    expect([403, 404]).toContain((await createBrief(request('POST', BRIEF), { params: Promise.resolve({ orgId, projectId }) })).status);

    const editor = await memberSession(orgId, projectId, 'editor', owner.id);
    const briefId = await createBriefAs(editor, orgId, projectId);
    expect([403, 404]).toContain((await putSettings(request('PUT', { dailyTextGenerations: 5, dailyVideoSeconds: 5 }), { params: Promise.resolve({ orgId, projectId }) })).status);
    const deleted = await deleteBrief(request('DELETE'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(deleted.status).toBe(200);
  });
});
