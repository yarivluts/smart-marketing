import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization, acceptInvite, registerSchemaDefinition } from '@growthos/firebase-orm-models';
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
  return { ownerSession, owner, organization, project };
}

async function registerCustomerSchema(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'entity',
    name: 'customer',
    fields: [
      { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
      { name: 'mrr_usd', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
    ],
    createdByUserId,
  });
}

function suggestRequest(orgId: string, projectId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/segments/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/segments/suggest', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = suggestRequest('org-1', 'project-1', { schemaName: 'customer' });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Suggest Segments Viewer Org');
    const viewerEmail = uniqueEmail('suggest-segments-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('suggest-segments-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = suggestRequest(organization.id, project.id, { schemaName: 'customer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects a body missing schemaName', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Suggest Segments Missing Field Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = suggestRequest(organization.id, project.id, {});
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns invalid_segment for a schema that is not registered (or not active) in this project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Suggest Segments No Schema Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = suggestRequest(organization.id, project.id, { schemaName: 'does_not_exist' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_segment');
  });

  it('returns 404 for a project id that does not belong to this org', async () => {
    const { ownerSession, organization } = await setupOrgProject('Suggest Segments Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = suggestRequest(organization.id, 'does-not-exist-project', { schemaName: 'customer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('proposes suggestions against a registered entity schema', async () => {
    const { owner, ownerSession, organization, project } = await setupOrgProject('Suggest Segments Draft Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = suggestRequest(organization.id, project.id, { schemaName: 'customer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { suggestions: Array<{ name: string; filters: unknown[]; confidence: number }> };
    expect(body.suggestions).toEqual([{ name: 'High-value customers', filters: [{ field: 'mrr_usd', op: '>=', value: 100 }], confidence: 0.85 }]);
  });
});
