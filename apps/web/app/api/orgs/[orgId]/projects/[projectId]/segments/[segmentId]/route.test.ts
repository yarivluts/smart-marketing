import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, createSegment, ensureUserForFirebaseSession, registerSchemaDefinition } from '@growthos/firebase-orm-models';
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

async function setupOrgProjectSegment(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'entity',
    name: 'customer',
    fields: [
      { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
      { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
    ],
    createdByUserId: owner.id,
  });
  const segment = await createSegment({
    organizationId: organization.id,
    projectId: project.id,
    name: 'Pro customers',
    schemaName: 'customer',
    filters: [{ field: 'plan', op: '=', value: 'pro' }],
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, segment };
}

function deleteRequest(
  orgId: string,
  projectId: string,
  segmentId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; segmentId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, segmentId }),
  };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/segments/[segmentId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'segment-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a segment id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectSegment('Segment Delete Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, 'does-not-exist');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('deletes an existing segment', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Delete Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, segment.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, segment.id);
    expect((await DELETE(second.request, { params: second.params })).status).toBe(404);
  });
});
