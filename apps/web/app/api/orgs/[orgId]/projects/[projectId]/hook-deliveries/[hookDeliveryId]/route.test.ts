import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createHookEndpoint,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  receiveHookPayload,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { PATCH } from './route';

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

async function setupDelivery(orgName: string) {
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
  const received = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: '{}', headers: {} });
  if (!received.ok) throw new Error('expected the delivery to be accepted');
  return { ownerSession, organization, project, delivery: received.value.delivery };
}

function statusRequest(
  orgId: string,
  projectId: string,
  hookDeliveryId: string,
  status: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; hookDeliveryId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/hook-deliveries/${hookDeliveryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
    params: Promise.resolve({ orgId, projectId, hookDeliveryId }),
  };
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/hook-deliveries/[hookDeliveryId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = statusRequest('org-1', 'project-1', 'delivery-1', 'reviewed');
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid status value', async () => {
    const { ownerSession, organization, project, delivery } = await setupDelivery('Hook Delivery Status Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = statusRequest(organization.id, project.id, delivery.id, 'mapped');
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
  });

  it('marks a delivery reviewed', async () => {
    const { ownerSession, organization, project, delivery } = await setupDelivery('Hook Delivery Status Reviewed Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = statusRequest(organization.id, project.id, delivery.id, 'reviewed');
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'reviewed' });
  });

  it('marks a delivery discarded', async () => {
    const { ownerSession, organization, project, delivery } = await setupDelivery('Hook Delivery Status Discarded Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = statusRequest(organization.id, project.id, delivery.id, 'discarded');
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'discarded' });
  });

  it('returns 404 for a delivery id that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupDelivery('Hook Delivery Status Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = statusRequest(organization.id, project.id, 'does-not-exist', 'reviewed');
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('lets a project-scoped project_admin update delivery status on their bound project but returns 403 on a sibling project', async () => {
    const { ownerSession, organization, project, delivery } = await setupDelivery('Hook Delivery Status Project Admin Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { project: siblingProject, environments: siblingEnvs } = await createProject({ organizationId: organization.id, name: 'Sibling' });
    const siblingProd = siblingEnvs.find((e) => e.name === 'prod')!;
    const siblingEndpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: siblingProject.id,
      environmentId: siblingProd.id,
      name: 's',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    const siblingReceived = await receiveHookPayload({ hookId: siblingEndpoint.hook_id, rawBody: '{}', headers: {} });
    if (!siblingReceived.ok) throw new Error('expected sibling delivery');

    const adminEmail = uniqueEmail('hook-delivery-status-project-admin');
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

    const allowed = statusRequest(organization.id, project.id, delivery.id, 'reviewed');
    expect((await PATCH(allowed.request, { params: allowed.params })).status).toBe(200);

    const blocked = statusRequest(organization.id, siblingProject.id, siblingReceived.value.delivery.id, 'reviewed');
    expect((await PATCH(blocked.request, { params: blocked.params })).status).toBe(403);
  });
});
