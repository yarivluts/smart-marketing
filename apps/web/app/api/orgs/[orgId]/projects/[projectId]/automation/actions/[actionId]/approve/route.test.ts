import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  engageAutomationKillSwitch,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  proposeAutomationBudgetChangeAction,
  requestResourceAttachment,
  setResourceAttachmentWriteTier,
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

function approveRequest(
  orgId: string,
  projectId: string,
  actionId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; actionId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/approve`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId, actionId }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

async function seedTarget(organizationId: string, projectId: string, seededByUserId: string, initialDailyBudgetUsd = 100) {
  return ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd,
    seededByUserId,
  });
}

/** Mirrors `execute/route.test.ts`'s own helper: seeds an approved credential connection at the given write tier and a target linked to it. */
async function seedTargetWithConnection(organizationId: string, projectId: string, ownerId: string, tier: 'read' | 'optimize' | 'manage') {
  const credential = await createSharedCredential({
    organizationId,
    name: 'Agency Stripe Account',
    provider: 'stripe',
    availableScopes: ['act_1'],
    createdByUserId: ownerId,
  });
  const attachment = await requestResourceAttachment({
    organizationId,
    projectId,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: ownerId,
    scopeSelection: ['act_1'],
  });
  await decideResourceAttachment({ organizationId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
  if (tier !== 'read') {
    await setResourceAttachmentWriteTier({ organizationId, attachmentId: attachment.id, tier, actorId: ownerId });
  }

  const target = await ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd: 100,
    seededByUserId: ownerId,
    resourceAttachmentId: attachment.id,
  });

  return { credential, target, attachment };
}

/** Proposes a plain budget-change action against `target`, returning it in the `awaiting_approval` state approve expects. */
async function proposedBudgetChangeAction(organizationId: string, projectId: string, targetId: string, ownerId: string) {
  return proposeAutomationBudgetChangeAction({
    organizationId,
    projectId,
    targetId,
    afterDailyBudgetUsd: 120,
    requestedByUserId: ownerId,
  });
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/[actionId]/approve', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = approveRequest('org-1', 'project-1', 'action-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.approve (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Approve Route Viewer Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposedBudgetChangeAction(organization.id, project.id, target.id, owner.id);

    const viewerEmail = uniqueEmail('viewer');
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
    const { request, params } = approveRequest(organization.id, project.id, proposed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an action id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Approve Route Missing Action Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = approveRequest(organization.id, project.id, 'does-not-exist');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 409 invalid_state for an action that is already approved', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Approve Route Invalid State Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const firstRequest = approveRequest(organization.id, project.id, proposed.id);
    const firstResponse = await POST(firstRequest.request, { params: firstRequest.params });
    expect(firstResponse.status).toBe(200);

    const secondRequest = approveRequest(organization.id, project.id, proposed.id);
    const secondResponse = await POST(secondRequest.request, { params: secondRequest.params });
    expect(secondResponse.status).toBe(409);
    expect(await secondResponse.json()).toEqual({ error: 'invalid_state' });
  });

  it('returns 409 kill_switch_engaged once the org kill switch is engaged', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Approve Route Kill Switch Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    await engageAutomationKillSwitch({ organizationId: organization.id, reason: 'Incident', actorId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = approveRequest(organization.id, project.id, proposed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'kill_switch_engaged' });
  });

  it('returns 409 insufficient_write_tier when the connection was downgraded after proposal', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Approve Route Tier Org');
    // Proposed at the `optimize` tier a budget change requires — landing it `awaiting_approval` — then
    // downgraded, so approve's own `assertSufficientWriteTierForAction` check is what rejects it (proposing
    // straight at an insufficient tier lands the action `blocked` instead, a separate invalid_state case
    // already covered above, not this one).
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'optimize');
    const proposed = await proposedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'read', actorId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = approveRequest(organization.id, project.id, proposed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'insufficient_write_tier' });
  });

  it('approves an awaiting_approval action and returns its resulting status', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Approve Route Success Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = approveRequest(organization.id, project.id, proposed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; status: string };
    expect(body.id).toBe(proposed.id);
    expect(body.status).toBe('approved');
  });
});
