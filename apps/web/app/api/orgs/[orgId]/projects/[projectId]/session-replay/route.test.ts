import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listOrgProjects,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, organization, project };
}

function replayRequest(orgId: string, projectId: string, body?: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/session-replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function projectTemplate(organizationId: string, projectId: string): Promise<string | undefined> {
  const projects = await listOrgProjects(organizationId);
  return projects.find((project) => project.id === projectId)?.session_replay_url_template;
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/session-replay', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = replayRequest('org-1', 'project-1', { template: 'https://example.com/{landing_page}' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org (non-enumeration)', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = replayRequest('does-not-exist-org', 'does-not-exist-project', { template: 'https://example.com/' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const { organization } = await setupOrgProject('Session Replay Route Viewer Org');
    const viewerEmail = uniqueEmail('session-replay-route-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('session-replay-route-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = replayRequest(organization.id, 'some-project', { template: 'https://example.com/' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that doesn't belong to this org (KAN-26 non-enumeration)", async () => {
    const { ownerSession, organization } = await setupOrgProject('Session Replay Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = replayRequest(organization.id, 'does-not-exist-project', { template: 'https://example.com/' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toEqual({ error: 'not_found' });
  });

  it('rejects an invalid JSON body', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Invalid JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const request = new NextRequest(`https://growthos.test/api/orgs/${organization.id}/projects/${project.id}/session-replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    const response = await POST(request, { params: Promise.resolve({ orgId: organization.id, projectId: project.id }) });
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({ error: 'invalid_json' });
  });

  it('rejects a non-string template value', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Non String Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = replayRequest(organization.id, project.id, { template: 12345 });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({ error: 'invalid_template' });
  });

  it('rejects a template with a disallowed URL scheme (XSS guard)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Bad Scheme Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = replayRequest(organization.id, project.id, { template: 'javascript:alert(document.cookie)' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({ error: 'invalid_template' });
    expect(await projectTemplate(organization.id, project.id)).toBeUndefined();
  });

  it('rejects a template that is not a well-formed URL', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Malformed Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = replayRequest(organization.id, project.id, { template: 'not a url at all' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({ error: 'invalid_template' });
  });

  it('sets a valid https template, persists it, and returns it in the response', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Set Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const template = 'https://replay.example.com/sessions?page={landing_page}';
    const { request, params } = replayRequest(organization.id, project.id, { template });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()) as { template: string }).toEqual({ template });
    expect(await projectTemplate(organization.id, project.id)).toBe(template);
  });

  it('clears a previously-set template with an empty string', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Clear Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const set = replayRequest(organization.id, project.id, { template: 'https://replay.example.com/' });
    expect((await POST(set.request, { params: set.params })).status).toBe(200);
    expect(await projectTemplate(organization.id, project.id)).toBe('https://replay.example.com/');

    const clear = replayRequest(organization.id, project.id, { template: '' });
    const response = await POST(clear.request, { params: clear.params });
    expect(response.status).toBe(200);
    expect((await response.json()) as { template: string }).toEqual({ template: '' });
    // Regression: the service used to assign `undefined` to clear the field, which the ORM's
    // `getDocumentData()` silently drops from the `updateDoc()` call — so the old value stayed
    // in Firestore forever even though the API claimed success. Must genuinely persist as ''.
    expect(await projectTemplate(organization.id, project.id)).toBe('');
  });

  it('treats a whitespace-only template as clearing it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Whitespace Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = replayRequest(organization.id, project.id, { template: '   ' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()) as { template: string }).toEqual({ template: '' });
    expect(await projectTemplate(organization.id, project.id)).toBe('');
  });

  it('treats an omitted template field as clearing it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Session Replay Route Omitted Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = replayRequest(organization.id, project.id, {});
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()) as { template: string }).toEqual({ template: '' });
  });
});
