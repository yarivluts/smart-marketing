import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  issueMcpAuthorizationCode,
  listAuditLogEntriesForOrg,
  listMcpOAuthGrantsForProject,
  registerMcpOAuthClient,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE } from './route';

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

/** Invites+accepts a project-scoped member (KAN-135) so a test can assert the KAN-136 gap is closed. */
async function inviteProjectScopedMember(
  organizationId: string,
  projectId: string,
  role: 'project_admin' | 'editor' | 'operator',
  invitedByUserId: string,
): Promise<DecodedIdToken> {
  const email = uniqueEmail(`project-${role}`);
  const invitation = await inviteMemberToOrganization({ organizationId, email, role, invitedByUserId, projectId });
  const session = await sessionFor(unique('uid'), email);
  const invitee = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: invitee.id, callerEmailVerified: true });
  return session;
}

function revokeRequest(
  orgId: string,
  projectId: string,
  grantId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; grantId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/mcp-grants/${grantId}`, {
      method: 'DELETE',
    }),
    params: Promise.resolve({ orgId, projectId, grantId }),
  };
}

async function setupOrgWithGrant(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('mcp-grant-owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const client = await registerMcpOAuthClient({
    clientName: 'Test MCP Client',
    redirectUris: ['https://client.example.com/callback'],
  });
  const { grant } = await issueMcpAuthorizationCode({
    clientId: client.id,
    redirectUri: client.redirect_uris[0],
    codeChallenge: unique('challenge'),
    codeChallengeMethod: 'S256',
    organizationId: organization.id,
    projectId: project.id,
    grantedByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, client, grant };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/mcp-grants/[grantId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = revokeRequest('org-1', 'project-1', 'grant-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold keys.manage (viewer)", async () => {
    const { owner, organization, project, grant } = await setupOrgWithGrant('MCP Grant Viewer Org');
    const viewerEmail = uniqueEmail('mcp-grant-viewer');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = revokeRequest(organization.id, project.id, grant.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(403);

    // Must not have actually revoked it.
    const summaries = await listMcpOAuthGrantsForProject(organization.id, project.id);
    expect(summaries.find((s) => s.id === grant.id)?.revokedAt).toBeUndefined();
  });

  it('returns 404 for an unknown grant id in a real project', async () => {
    const { ownerSession, organization, project } = await setupOrgWithGrant('MCP Grant Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, 'does-not-exist-grant');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 404 for a real grant that belongs to a different project in the same org', async () => {
    const { ownerSession, organization, grant } = await setupOrgWithGrant('MCP Grant Cross Project Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, otherProject.id, grant.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('revokes an existing grant immediately, gated by keys.manage, not only the granting user', async () => {
    const { owner, organization, project, client, grant } = await setupOrgWithGrant('MCP Grant Happy Org');
    // A different project admin (not the user who approved the consent screen) revokes it.
    const adminEmail = uniqueEmail('mcp-grant-admin');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: adminEmail,
      role: 'org_admin',
      invitedByUserId: owner.id,
    });
    const adminSession = await sessionFor(unique('uid'), adminEmail);
    const admin = await ensureUserForFirebaseSession({ firebaseUid: adminSession.uid, email: adminEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: admin.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(adminSession);
    const { request, params } = revokeRequest(organization.id, project.id, grant.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'revoked' });

    const summaries = await listMcpOAuthGrantsForProject(organization.id, project.id);
    const summary = summaries.find((s) => s.id === grant.id);
    expect(summary?.revokedAt).toBeTruthy();
    expect(summary?.revokedDueToTokenReuse).toBe(false);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const revokeEntry = entries.find((entry) => entry.action === 'mcp_oauth_grant.revoke');
    expect(revokeEntry?.actor_id).toBe(admin.id);
    expect(revokeEntry?.target_id).toBe(grant.id);
    expect(revokeEntry?.summary).toContain(client.id);
  });

  it('is idempotent: revoking an already-revoked grant succeeds again rather than 404ing', async () => {
    const { ownerSession, organization, project, grant } = await setupOrgWithGrant('MCP Grant Repeat Revoke Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = revokeRequest(organization.id, project.id, grant.id);
    const firstResponse = await DELETE(first.request, { params: first.params });
    expect(firstResponse.status).toBe(200);

    const second = revokeRequest(organization.id, project.id, grant.id);
    const secondResponse = await DELETE(second.request, { params: second.params });
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual({ status: 'revoked' });
  });

  it('KAN-142: lets a project-scoped project_admin revoke an MCP grant in THEIR OWN project', async () => {
    const { owner, organization, project, grant } = await setupOrgWithGrant('MCP Grant Project-Scoped Org');
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = revokeRequest(organization.id, project.id, grant.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);
  });

  it(
    "KAN-142 isolation: a project-scoped project_admin for one project still can't reach a SIBLING " +
      'project in the same org',
    async () => {
      const { owner, organization, project } = await setupOrgWithGrant('MCP Grant Sibling Project Org');
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = revokeRequest(organization.id, otherProject.id, 'some-grant');
      const response = await DELETE(request, { params });
      expect(response.status).toBe(403);
    },
  );
});
