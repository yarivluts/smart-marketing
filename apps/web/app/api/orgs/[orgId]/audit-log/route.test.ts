import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  mintApiKey,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

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

function auditLogRequest(orgId: string): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/audit-log`),
    params: Promise.resolve({ orgId }),
  };
}

describe('GET /api/orgs/[orgId]/audit-log', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = auditLogRequest('org-1');
    expect((await GET(request, { params })).status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = auditLogRequest('does-not-exist-org');
    expect((await GET(request, { params })).status).toBe(404);
  });

  it("rejects a member whose role doesn't hold audit.read (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('audit-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Audit Viewer Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('audit-viewer');
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
    const { request, params } = auditLogRequest(organization.id);
    expect((await GET(request, { params })).status).toBe(403);
  });

  it('lets an org_owner list an empty audit log', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('audit-empty-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Audit Empty Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = auditLogRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [], chain: { valid: true, entryCount: 0 } });
  });

  it('surfaces an entry recorded by another service (mintApiKey) with a valid chain', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('audit-mint-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Audit Mint Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;

    await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Prod key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = auditLogRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: Array<Record<string, unknown>>; chain: { valid: boolean; entryCount: number } };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ action: 'api_key.mint', actorId: owner.id, projectId: project.id });
    expect(body.chain).toEqual({ valid: true, entryCount: 1 });
  });
});
