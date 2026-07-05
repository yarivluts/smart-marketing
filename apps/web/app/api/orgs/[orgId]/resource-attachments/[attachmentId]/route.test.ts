import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  requestResourceAttachment,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE, PATCH } from './route';

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

async function setupPendingAttachment(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('decide-owner'));
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
  return { ownerSession, owner, organization, attachment };
}

function patchRequest(orgId: string, attachmentId: string, approve: unknown): NextRequest {
  return new NextRequest(`https://growthos.test/api/orgs/${orgId}/resource-attachments/${attachmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve }),
  });
}

describe('PATCH /api/orgs/[orgId]/resource-attachments/[attachmentId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest('org-1', 'attach-1', true), {
      params: Promise.resolve({ orgId: 'org-1', attachmentId: 'attach-1' }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold resources.manage (viewer)", async () => {
    const { owner, organization, attachment } = await setupPendingAttachment('Decide Viewer Org');
    const viewerEmail = uniqueEmail('decide-viewer');
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
    const response = await PATCH(patchRequest(organization.id, attachment.id, true), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(403);
  });

  it('rejects a non-boolean approve field', async () => {
    const { ownerSession, organization, attachment } = await setupPendingAttachment('Decide Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, attachment.id, 'yes'), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an attachment id that does not exist', async () => {
    const { ownerSession, organization } = await setupPendingAttachment('Decide Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, 'does-not-exist', true), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
  });

  it('lets an org_owner approve a pending attachment, and rejects deciding it again', async () => {
    const { ownerSession, organization, attachment } = await setupPendingAttachment('Decide Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, attachment.id, true), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'approved' });

    const secondDecision = await PATCH(patchRequest(organization.id, attachment.id, false), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(secondDecision.status).toBe(409);
  });
});

describe('DELETE /api/orgs/[orgId]/resource-attachments/[attachmentId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: 'org-1', attachmentId: 'attach-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects detaching an attachment that is still pending (not yet approved)', async () => {
    const { ownerSession, organization, attachment } = await setupPendingAttachment('Detach Pending Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(409);
  });

  it('lets an org_owner detach an approved attachment', async () => {
    const { ownerSession, organization, attachment } = await setupPendingAttachment('Detach Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    await PATCH(patchRequest(organization.id, attachment.id, true), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });

    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, attachmentId: attachment.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'detached' });
  });
});
