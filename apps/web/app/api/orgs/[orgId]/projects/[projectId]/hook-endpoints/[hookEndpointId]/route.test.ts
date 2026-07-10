import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createHookEndpoint, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
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

async function setupEndpoint(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  const endpoint = await createHookEndpoint({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prodEnvironment.id,
    name: 'x',
    signatureMode: 'none',
    createdByUserId: owner.id,
  });
  return { ownerSession, organization, project, endpoint };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/hook-endpoints/[hookEndpointId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1', hookEndpointId: 'endpoint-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('disables an endpoint immediately', async () => {
    const { ownerSession, organization, project, endpoint } = await setupEndpoint('Hooks Disable Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, hookEndpointId: endpoint.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'disabled' });
  });

  it('returns 404 for an endpoint that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupEndpoint('Hooks Disable Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, hookEndpointId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
  });
});
