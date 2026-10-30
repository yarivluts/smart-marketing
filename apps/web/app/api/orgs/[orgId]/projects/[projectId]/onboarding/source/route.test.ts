import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
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

function sourceRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/onboarding/source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/onboarding/source', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = sourceRequest('org-1', 'project-1', { method: 'push_your_own' });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects an invalid method', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Source Route Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sourceRequest(organization.id, project.id, { method: 'carrier-pigeon' });
    expect((await POST(request, { params })).status).toBe(400);
  });

  it('records "push_your_own" and advances to "funnel"', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Source Route Push Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sourceRequest(organization.id, project.id, { method: 'push_your_own' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: { sourceConnectionMethod: string; connectedSourcePluginId: string | null; step: string } };
    expect(body.state.sourceConnectionMethod).toBe('push_your_own');
    expect(body.state.connectedSourcePluginId).toBeNull();
    expect(body.state.step).toBe('funnel');
  });

  it('records "plugin" with the connected plugin id', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Source Route Plugin Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sourceRequest(organization.id, project.id, { method: 'plugin', pluginId: 'com.growthos.stripe' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: { connectedSourcePluginId: string | null } };
    expect(body.state.connectedSourcePluginId).toBe('com.growthos.stripe');
  });

  it('lets a project-scoped project_admin record source connection on their bound project but returns 403 on a sibling project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Source Project Admin Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { project: siblingProject } = await createProject({ organizationId: organization.id, name: 'Sibling' });

    const adminEmail = uniqueEmail('onboarding-source-project-admin');
    const invite = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: adminEmail,
      role: 'project_admin',
      invitedByUserId: owner.id,
      projectId: project.id,
    });
    const adminSession = await sessionFor(unique('uid'), adminEmail);
    const adminUser = await ensureUserForFirebaseSession({ firebaseUid: adminSession.uid, email: adminEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invite.id, userId: adminUser.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(adminSession);

    const allowed = sourceRequest(organization.id, project.id, { method: 'push_your_own' });
    expect((await POST(allowed.request, { params: allowed.params })).status).toBe(200);

    const blocked = sourceRequest(organization.id, siblingProject.id, { method: 'push_your_own' });
    expect((await POST(blocked.request, { params: blocked.params })).status).toBe(403);
  });
});
