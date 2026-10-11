import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createWinRule,
  ensureUserForFirebaseSession,
  evaluateRecordAgainstWinRules,
  inviteMemberToOrganization,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

const { getServerSessionMock, requestCookies } = vi.hoisted(() => ({ getServerSessionMock: vi.fn(), requestCookies: new Map<string, string>() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
// The route reads the project's environment-picker cookie (KAN-196) through `next/headers`, which
// only works inside a real request scope.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name)! } : undefined),
  }),
}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  requestCookies.clear();
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project, environments };
}

function feedRequest(orgId: string, projectId: string, headers?: Record<string, string>): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/win-rules/feed`, { headers }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/win-rules/feed', () => {
  it('rejects an unauthenticated caller before opening a stream', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = feedRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project, owner } = await setupOrgProject('Win Feed Route Viewer Org');
    const viewerEmail = uniqueEmail('win-feed-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = feedRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('opens an SSE stream for an authorized org_owner', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Win Feed Route Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = feedRequest(organization.id, project.id);
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(value)).toContain('retry: 2000');
  });

  it("streams the wins of the environment the project's environment-picker cookie selects (KAN-196)", async () => {
    const { ownerSession, owner, organization, project, environments } = await setupOrgProject('Win Feed Route Env Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    await createWinRule({ organizationId: organization.id, projectId: project.id, name: 'New signup', schemaName: 'signup', filters: [], createdByUserId: owner.id });
    const since = new Date(Date.now() - 1000).toISOString();
    for (const environment of environments) {
      await evaluateRecordAgainstWinRules({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: environment.id,
        kind: 'event',
        schemaName: 'signup',
        clientId: `evt_${environment.name}`,
        payload: {},
        rawRecordId: `raw_${environment.name}`,
        occurredAt: new Date().toISOString(),
      });
    }

    requestCookies.set(`gos_env_${project.id}`, 'dev');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const request = new NextRequest(`https://growthos.test/api/orgs/${organization.id}/projects/${project.id}/win-rules/feed?since=${encodeURIComponent(since)}`);
    const response = await GET(request, { params: Promise.resolve({ orgId: organization.id, projectId: project.id }) });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('event: win')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(text).toContain('"clientId":"evt_dev"');
    expect(text).not.toContain('evt_prod');
    expect(text).not.toContain('evt_staging');
  });
});
