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
