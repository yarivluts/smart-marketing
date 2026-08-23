import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureFirmographicPackRegistered,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
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

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

function checkCompositionAlertsRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/firmographics/check-composition-alerts`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/firmographics/check-composition-alerts', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = checkCompositionAlertsRequest('org-1', 'project-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = checkCompositionAlertsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold ingest.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Composition Alerts Viewer Org');
    const viewerEmail = uniqueEmail('composition-alerts-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('composition-alerts-owner-2') });
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = checkCompositionAlertsRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Composition Alerts Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = checkCompositionAlertsRequest(organization.id, 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('degrades to a "warehouse not configured" outcome (buildable-today default)', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Composition Alerts Degrade Org');
    await ensureFirmographicPackRegistered(organization.id, project.id, owner.id);

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = checkCompositionAlertsRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('warehouse_not_configured');
  });
});
