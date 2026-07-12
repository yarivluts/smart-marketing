import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET, POST } from './route';

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

function onboardingRequest(
  orgId: string,
  projectId: string,
  method: 'GET' | 'POST',
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/onboarding`, { method }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/onboarding', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = onboardingRequest('org-1', 'project-1', 'GET');
    expect((await GET(request, { params })).status).toBe(401);
  });

  it('returns 404 for a caller with no active membership (non-enumeration)', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = onboardingRequest('does-not-exist-org', 'does-not-exist-project', 'GET');
    expect((await GET(request, { params })).status).toBe(404);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Onboarding Route Viewer Org');
    const viewerEmail = uniqueEmail('onboarding-route-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('onboarding-route-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = onboardingRequest(organization.id, project.id, 'GET');
    expect((await GET(request, { params })).status).toBe(403);
  });

  it('returns null before the wizard has ever been started', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Route Unstarted Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = onboardingRequest(organization.id, project.id, 'GET');
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()) as { state: unknown }).toEqual({ state: null });
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/onboarding', () => {
  it('starts the wizard at the "pack" step, and is idempotent on a second call', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Route Start Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = onboardingRequest(organization.id, project.id, 'POST');
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(201);
    const firstBody = (await firstResponse.json()) as { state: { step: string; completedAt: string | null } };
    expect(firstBody.state.step).toBe('pack');
    expect(firstBody.state.completedAt).toBeNull();

    const second = onboardingRequest(organization.id, project.id, 'GET');
    const secondResponse = await GET(second.request, { params: second.params });
    const secondBody = (await secondResponse.json()) as { state: { step: string } | null };
    expect(secondBody.state?.step).toBe('pack');
  });
});
