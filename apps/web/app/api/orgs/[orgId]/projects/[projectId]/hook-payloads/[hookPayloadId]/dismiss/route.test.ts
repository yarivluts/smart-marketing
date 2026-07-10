import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  mintHookEndpoint,
  receiveHookPayload,
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

function dismissRequest(
  orgId: string,
  projectId: string,
  hookPayloadId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; hookPayloadId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/hook-payloads/${hookPayloadId}/dismiss`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId, hookPayloadId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/hook-payloads/[hookPayloadId]/dismiss', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = dismissRequest('org-1', 'project-1', 'payload-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown payload in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('dismiss-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Dismiss Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = dismissRequest(organization.id, project.id, 'does-not-exist-payload');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('dismisses a pending payload', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('dismiss-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Dismiss Happy Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;

    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Open hook',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    const payload = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody: '{"n":1}',
      headers: {},
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = dismissRequest(organization.id, project.id, payload.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'dismissed' });
  });
});
