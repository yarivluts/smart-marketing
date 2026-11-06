// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createAdStudioDemoRecording,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listAuditLogEntriesForOrg,
  markAdStudioDemoRecordingReady,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage, resetAdStudioRuntime, type DemoDriver } from '@/lib/ad-studio/engine';
import { DELETE as clearAccess, GET as getAccess, PUT as putAccess } from './demo-access/route';
import { GET as listRecordings, POST as record } from './demo-recordings/route';
import { PATCH as selectSegments } from './demo-recordings/[recordingId]/route';
import { GET as recordingMedia } from './demo-recordings/[recordingId]/media/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

const PASSWORD = 'Trial-Pa55word!';
const LOGIN_URL = 'https://93.184.216.34/login';
let storage = createMemoryMediaStorage();
const launched: { loginTyped: string[] } = { loginTyped: [] };

/** A browser whose sign-in never works: the recording runs and fails as login_failed. */
function failingBrowser(): DemoDriver {
  return {
    open: async () => true,
    url: () => LOGIN_URL,
    login: async ({ password }) => {
      launched.loginTyped.push(password);
      return 'submitted';
    },
    passwordFieldVisible: async () => true,
    lockForms: async () => undefined,
    snapshot: async () => ({ url: LOGIN_URL, title: '', headings: [], clickables: [] }),
    click: async () => false,
    settle: async () => undefined,
    scroll: async () => undefined,
    startCapture: async () => undefined,
    stopCapture: async () => undefined,
    close: async () => undefined,
  };
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  storage = createMemoryMediaStorage();
  launched.loginTyped = [];
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  configureAdStudioRuntime({ mediaStorage: () => storage, demoBrowser: async () => failingBrowser(), demoAddressCheck: async () => undefined });
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  resetAdStudioRuntime();
  configureAdStudioRuntime({ ensureOrm: ensureFirestoreOrm });
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
  const { organization } = await createOrganizationWithOwner({ name: 'Demo Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'App' });
  const orgId = organization.id;
  const projectId = project.id;
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId, projectId, ...extra }) }) as never;
  return { ownerSession, owner, orgId, projectId, p };
}

async function memberSession(orgId: string, projectId: string, role: 'editor' | 'viewer', invitedBy: string): Promise<DecodedIdToken> {
  const email = `${unique(role)}@example.com`;
  const invitation = await inviteMemberToOrganization({ organizationId: orgId, email, role, invitedByUserId: invitedBy, ...(role === 'viewer' ? {} : { projectId }) });
  const session = await sessionFor(email);
  const user = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId: orgId, membershipId: invitation.id, userId: user.id, callerEmailVerified: true });
  return session;
}

function request(method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ACCESS = { loginUrl: LOGIN_URL, username: 'trial@example.com', password: PASSWORD, notes: 'Show the dashboard' };

describe('Ad Studio trial access routes', () => {
  it('a project admin saves the trial access; no response, list or audit entry ever carries the password', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const saved = await putAccess(request('PUT', { demoAccess: ACCESS }), ctx.p());
    expect(saved.status).toBe(200);
    const savedText = await saved.text();
    expect(savedText).not.toContain(PASSWORD);
    expect(JSON.parse(savedText)).toMatchObject({ demoAccess: { loginUrl: LOGIN_URL, username: 'trial@example.com', hasPassword: true, notes: 'Show the dashboard' } });

    const read = await (await getAccess(request('GET'), ctx.p())).text();
    expect(read).not.toContain(PASSWORD);
    expect(JSON.parse(read).demoAccess.hasPassword).toBe(true);

    // An empty password keeps the stored one.
    const kept = await putAccess(request('PUT', { demoAccess: { ...ACCESS, password: '', notes: 'Only reports' } }), ctx.p());
    expect(((await kept.json()) as { demoAccess: { hasPassword: boolean } }).demoAccess.hasPassword).toBe(true);

    const audit = JSON.stringify(await listAuditLogEntriesForOrg(ctx.orgId));
    expect(audit).toContain('ad_studio.demo_access_set');
    expect(audit).not.toContain(PASSWORD);

    expect((await clearAccess(request('DELETE'), ctx.p())).status).toBe(200);
    expect(((await (await getAccess(request('GET'), ctx.p())).json()) as { demoAccess: unknown }).demoAccess).toBeNull();
  });

  it('refuses a private or plain-http address by field, and a malformed body', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const privateAddress = await putAccess(request('PUT', { demoAccess: { ...ACCESS, loginUrl: 'https://10.0.0.8/login' } }), ctx.p());
    expect(privateAddress.status).toBe(400);
    expect(await privateAddress.json()).toEqual({ error: 'invalid_demo_access', fields: ['login_url'] });
    expect((await putAccess(request('PUT', { demoAccess: { ...ACCESS, loginUrl: 'http://93.184.216.34/' } }), ctx.p())).status).toBe(400);
    expect((await putAccess(request('PUT', { demoAccess: 'nope' }), ctx.p())).status).toBe(400);
  });

  it('only project.configure sees or changes the trial access', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    await putAccess(request('PUT', { demoAccess: ACCESS }), ctx.p());
    getServerSessionMock.mockResolvedValue(await memberSession(ctx.orgId, ctx.projectId, 'editor', ctx.owner.id));
    expect([403, 404]).toContain((await getAccess(request('GET'), ctx.p())).status);
    expect([403, 404]).toContain((await putAccess(request('PUT', { demoAccess: ACCESS }), ctx.p())).status);
    expect([403, 404]).toContain((await clearAccess(request('DELETE'), ctx.p())).status);
  });
});

describe('Ad Studio walkthrough recording routes', () => {
  it('refuses to record without trial access', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const response = await record(request('POST'), ctx.p());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'demo_request', code: 'no_demo_access' });
  });

  it('an editor records; a failed sign-in is kept with its code, and the password reaches only the browser', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    await putAccess(request('PUT', { demoAccess: ACCESS }), ctx.p());
    getServerSessionMock.mockResolvedValue(await memberSession(ctx.orgId, ctx.projectId, 'editor', ctx.owner.id));
    const response = await record(request('POST'), ctx.p());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(PASSWORD);
    expect(JSON.parse(text)).toMatchObject({ recording: { status: 'failed', failureCode: 'login_failed', site: '93.184.216.34' } });
    expect(launched.loginTyped).toEqual([PASSWORD]);
    const listed = (await (await listRecordings(request('GET'), ctx.p())).json()) as { recordings: { status: string }[] };
    expect(listed.recordings.map((row) => row.status)).toEqual(['failed']);
  });

  it('a viewer cannot record or list', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(await memberSession(ctx.orgId, ctx.projectId, 'viewer', ctx.owner.id));
    expect([403, 404]).toContain((await record(request('POST'), ctx.p())).status);
    expect([403, 404]).toContain((await listRecordings(request('GET'), ctx.p())).status);
  });

  it('chooses the moments used in ads and streams the recording', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const recording = await createAdStudioDemoRecording({ organizationId: ctx.orgId, projectId: ctx.projectId, site: 'app.example.com', requestedBy: ctx.owner.id });
    const objectPath = `orgs/${ctx.orgId}/projects/${ctx.projectId}/demo-recordings/${recording.id}.mp4`;
    await storage.upload(objectPath, Buffer.from('walkthrough'), 'video/mp4');
    await markAdStudioDemoRecordingReady(recording, {
      gcsPath: objectPath,
      durationSeconds: 10,
      segments: [
        { id: 'a', startSeconds: 0, endSeconds: 4, title: 'Dashboard', description: '', selected: true },
        { id: 'b', startSeconds: 4, endSeconds: 9, title: 'Reports', description: '', selected: false },
      ],
    });
    const chosen = await selectSegments(request('PATCH', { selectedSegmentIds: ['b'] }), ctx.p({ recordingId: recording.id }));
    expect(chosen.status).toBe(200);
    expect(((await chosen.json()) as { recording: { segments: { selected: boolean }[] } }).recording.segments.map((segment) => segment.selected)).toEqual([false, true]);
    expect((await selectSegments(request('PATCH', { selectedSegmentIds: ['zzz'] }), ctx.p({ recordingId: recording.id }))).status).toBe(400);
    expect((await selectSegments(request('PATCH', { selectedSegmentIds: 'b' }), ctx.p({ recordingId: recording.id }))).status).toBe(400);
    expect((await selectSegments(request('PATCH', { selectedSegmentIds: [] }), ctx.p({ recordingId: 'missing' }))).status).toBe(404);

    const media = await recordingMedia(request('GET'), ctx.p({ recordingId: recording.id }));
    expect(media.status).toBe(200);
    expect(await media.text()).toBe('walkthrough');
  });
});
