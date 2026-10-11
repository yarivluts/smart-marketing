import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  ingestBatch,
  inviteMemberToOrganization,
  listQuarantinedRecordsForProject,
  registerSchemaDefinition,
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { ownerSession, owner, organization, project, prodEnvironment };
}

/** Invites+accepts a project-scoped member (KAN-135) so a test can assert the KAN-136 gap is closed. */
async function inviteProjectScopedMember(
  organizationId: string,
  projectId: string,
  role: 'project_admin' | 'editor' | 'operator',
  invitedByUserId: string,
): Promise<DecodedIdToken> {
  const email = uniqueEmail(`project-${role}`);
  const invitation = await inviteMemberToOrganization({ organizationId, email, role, invitedByUserId, projectId });
  const session = await sessionFor(unique('uid'), email);
  const invitee = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: invitee.id, callerEmailVerified: true });
  return session;
}

/** Quarantines one record via a real ingest of an event with a field the registered schema doesn't know about. */
async function quarantineOneRecord(
  organizationId: string,
  projectId: string,
  environmentId: string,
  ownerId: string,
): Promise<string> {
  await registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name: 'signup',
    fields: [{ name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
    createdByUserId: ownerId,
  });
  await ingestBatch({
    organizationId,
    projectId,
    environmentId,
    input: {
      kind: 'event',
      records: [{ event_id: unique('e'), event: 'signup', ts: '2026-07-07T10:00:00Z', properties: { plan: 'pro', referrer: 'google' } }],
    },
  });
  const [quarantined] = await listQuarantinedRecordsForProject(organizationId, projectId);
  return quarantined.id;
}

function dismissRequest(
  orgId: string,
  projectId: string,
  quarantinedRecordId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; quarantinedRecordId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/quarantined-records/${quarantinedRecordId}/dismiss`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId, quarantinedRecordId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/quarantined-records/[quarantinedRecordId]/dismiss', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = dismissRequest('org-1', 'project-1', 'record-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = dismissRequest('does-not-exist-org', 'does-not-exist-project', 'record-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold ingest.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Dismiss Route Viewer Org');
    const viewerEmail = uniqueEmail('dismiss-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('dismiss-owner-2') });
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
    const { request, params } = dismissRequest(organization.id, project.id, 'record-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a quarantined record id that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Dismiss Route Missing Record Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = dismissRequest(organization.id, project.id, 'does-not-exist');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it("returns 404 for a quarantined record id that belongs to a sibling org's project", async () => {
    const { owner, organization, project, prodEnvironment } = await setupOrgProject('Dismiss Route Isolation Org A');
    const other = await setupOrgProject('Dismiss Route Isolation Org B');
    const recordId = await quarantineOneRecord(organization.id, project.id, prodEnvironment.id, owner.id);

    getServerSessionMock.mockResolvedValue(other.ownerSession);
    const { request, params } = dismissRequest(other.organization.id, other.project.id, recordId);
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('dismisses a quarantined record and drops it from the quarantine list', async () => {
    const { ownerSession, owner, organization, project, prodEnvironment } = await setupOrgProject('Dismiss Route Success Org');
    const recordId = await quarantineOneRecord(organization.id, project.id, prodEnvironment.id, owner.id);

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = dismissRequest(organization.id, project.id, recordId);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: 'dismissed' });

    const stillQuarantined = await listQuarantinedRecordsForProject(organization.id, project.id);
    expect(stillQuarantined).toHaveLength(0);
  });

  it('returns 409 for a record that has already been dismissed', async () => {
    const { ownerSession, owner, organization, project, prodEnvironment } = await setupOrgProject('Dismiss Route Twice Org');
    const recordId = await quarantineOneRecord(organization.id, project.id, prodEnvironment.id, owner.id);

    getServerSessionMock.mockResolvedValue(ownerSession);
    const first = dismissRequest(organization.id, project.id, recordId);
    expect((await POST(first.request, { params: first.params })).status).toBe(200);

    const second = dismissRequest(organization.id, project.id, recordId);
    const response = await POST(second.request, { params: second.params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'invalid_state' });
  });

  it('KAN-141: lets a project-scoped project_admin dismiss a quarantined record in THEIR OWN project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupOrgProject('Dismiss Route Project-Scoped Org');
    const recordId = await quarantineOneRecord(organization.id, project.id, prodEnvironment.id, owner.id);
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = dismissRequest(organization.id, project.id, recordId);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
  });

  it(
    "KAN-141 isolation: a project-scoped project_admin for one project still can't reach a SIBLING " +
      'project in the same org',
    async () => {
      const { organization, project, owner } = await setupOrgProject('Dismiss Route Sibling Project Org');
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = dismissRequest(organization.id, otherProject.id, 'record-1');
      const response = await POST(request, { params });
      expect(response.status).toBe(403);
    },
  );
});
