import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createResourceTemplate,
  createSharedCredential,
  decideResourceAttachment,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listAuditLogEntriesForOrg,
  requestResourceAttachment,
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

async function setupApprovedCredentialAttachment(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('write-tier-owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Project A' });
  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'Cred',
    provider: 'generic',
    availableScopes: ['scope-1'],
    createdByUserId: owner.id,
  });
  const attachment = await requestResourceAttachment({
    organizationId: organization.id,
    projectId: project.id,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: owner.id,
    scopeSelection: ['scope-1'],
  });
  const approved = await decideResourceAttachment({
    organizationId: organization.id,
    attachmentId: attachment.id,
    decidedByUserId: owner.id,
    approve: true,
  });
  return { ownerSession, owner, organization, project, attachment: approved };
}

function writeTierRequest(orgId: string, attachmentId: string, body: unknown): NextRequest {
  return new NextRequest(`https://growthos.test/api/orgs/${orgId}/resource-attachments/${attachmentId}/write-tier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/orgs/[orgId]/resource-attachments/[attachmentId]/write-tier', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(writeTierRequest('org-1', 'attach-1', { tier: 'optimize' }), {
      params: Promise.resolve({ orgId: 'org-1', attachmentId: 'attach-1' }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold resources.manage (viewer)", async () => {
    const { owner, organization, attachment } = await setupApprovedCredentialAttachment('Write Tier Viewer Org');
    const viewerEmail = uniqueEmail('write-tier-viewer');
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
    const response = await POST(writeTierRequest(organization.id, attachment.id, { tier: 'optimize' }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(403);
  });

  it('rejects a malformed JSON body', async () => {
    const { ownerSession, organization, attachment } = await setupApprovedCredentialAttachment('Write Tier Bad Json Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(writeTierRequest(organization.id, attachment.id, '{not json'), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('rejects a non-string tier field', async () => {
    const { ownerSession, organization, attachment } = await setupApprovedCredentialAttachment('Write Tier Non String Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(writeTierRequest(organization.id, attachment.id, { tier: 5 }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_tier' });
  });

  it('rejects an unrecognized tier value', async () => {
    const { ownerSession, organization, attachment } = await setupApprovedCredentialAttachment('Write Tier Unknown Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(writeTierRequest(organization.id, attachment.id, { tier: 'admin' }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_tier' });
  });

  it('returns 404 for an attachment id that does not exist', async () => {
    const { ownerSession, organization } = await setupApprovedCredentialAttachment('Write Tier Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(writeTierRequest(organization.id, 'does-not-exist', { tier: 'optimize' }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('rejects setting a write tier on a non-credential attachment (template)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('write-tier-template-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Write Tier Template Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Project A' });
    const template = await createResourceTemplate({
      organizationId: organization.id,
      name: 'Template',
      type: 'dashboard',
      createdByUserId: owner.id,
    });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'template',
      resourceId: template.id,
      requestedByUserId: owner.id,
    });
    const approved = await decideResourceAttachment({
      organizationId: organization.id,
      attachmentId: attachment.id,
      decidedByUserId: owner.id,
      approve: true,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await POST(writeTierRequest(organization.id, approved.id, { tier: 'optimize' }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: approved.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'not_a_credential' });
  });

  it('rejects setting a write tier on a credential attachment that is still pending (not yet approved)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('write-tier-pending-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Write Tier Pending Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Project A' });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Cred',
      provider: 'generic',
      availableScopes: ['scope-1'],
      createdByUserId: owner.id,
    });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['scope-1'],
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await POST(writeTierRequest(organization.id, attachment.id, { tier: 'optimize' }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not_approved' });
  });

  it('lets an org_owner raise an approved credential attachment to a higher write tier', async () => {
    const { ownerSession, owner, organization, attachment } = await setupApprovedCredentialAttachment('Write Tier Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(writeTierRequest(organization.id, attachment.id, { tier: 'manage' }), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: attachment.id, writeTier: 'manage' });

    // The audit entry must attribute this to the *signed-in caller* and
    // record the real before/after tiers — that's the one thing this route
    // actually establishes over calling the service directly.
    const entries = await listAuditLogEntriesForOrg(organization.id);
    const tierEntry = entries.find((candidate) => candidate.action === 'resource_attachment.write_tier_change');
    expect(tierEntry?.actor_id).toBe(owner.id);
    expect(tierEntry?.before).toEqual({ tier: 'read' });
    expect(tierEntry?.after).toEqual({ tier: 'manage' });
  });
});
