import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  approveAutomationAction,
  createOrganizationWithOwner,
  createProject,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  executeAutomationAction,
  inviteMemberToOrganization,
  proposeCampaignDraftCreateAction,
  type GoogleAdsCampaignDraft,
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

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

async function seedTarget(organizationId: string, projectId: string, seededByUserId: string) {
  return ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd: 100,
    seededByUserId,
  });
}

function campaignDraft(overrides: Partial<GoogleAdsCampaignDraft> = {}): GoogleAdsCampaignDraft {
  return {
    platform: 'google_ads',
    campaignName: 'Winning Themes',
    advertisingChannelType: 'SEARCH',
    dailyBudgetUsd: 25,
    adGroups: [
      {
        name: 'Ad Group 1',
        keywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
        negativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
        responsiveSearchAd: {
          headlines: ['Buy Blue Widgets', 'Best Widgets Online', 'Widgets For Less'],
          descriptions: ['Free shipping on all widgets.', 'Order today, ships tomorrow.'],
          finalUrl: 'https://example.com/widgets',
        },
      },
    ],
    ...overrides,
  };
}

/** Creates a target with an already-created, still-paused campaign — the only state `proposeCampaignActivationAction` accepts. */
async function seedPausedCampaignTarget(organizationId: string, projectId: string, ownerId: string) {
  const target = await seedTarget(organizationId, projectId, ownerId);
  const created = await proposeCampaignDraftCreateAction({
    organizationId,
    projectId,
    targetId: target.id,
    draft: campaignDraft(),
    requestedByUserId: ownerId,
  });
  await approveAutomationAction({ organizationId, projectId, actionId: created.id, approverId: ownerId });
  await executeAutomationAction({ organizationId, projectId, actionId: created.id, executedByUserId: ownerId });
  return target;
}

function campaignActivationsUrl(orgId: string, projectId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-activations`;
}

function postRequest(orgId: string, projectId: string, body: string): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(campaignActivationsUrl(orgId, projectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function setupViewerSession(organizationId: string, ownerId: string): Promise<DecodedIdToken> {
  const viewerEmail = uniqueEmail('viewer');
  const invitation = await inviteMemberToOrganization({ organizationId, email: viewerEmail, role: 'viewer', invitedByUserId: ownerId });
  const viewerSession = await sessionFor(unique('uid'), viewerEmail);
  const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });
  return viewerSession;
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/campaign-activations', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', JSON.stringify({ targetId: 'x' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org (non-enumeration)', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = postRequest('does-not-exist-org', 'does-not-exist-project', JSON.stringify({ targetId: 'x' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization } = await setupOrgWithProject('Campaign Activations POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, 'some-project', JSON.stringify({ targetId: 'x' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Activations POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 target_id_required when targetId is missing or blank', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Activations POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = postRequest(organization.id, project.id, JSON.stringify({}));
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const blank = postRequest(organization.id, project.id, JSON.stringify({ targetId: '   ' }));
    const blankResponse = await POST(blank.request, { params: blank.params });
    expect(blankResponse.status).toBe(400);
    expect(await blankResponse.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 404 not_found for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Campaign Activations POST Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, 'does-not-exist', JSON.stringify({ targetId: 'campaign-1' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 404 not_found for a target id that does not exist in the project', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Activations POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'does-not-exist' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_action for a target with no paused campaign to activate', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Campaign Activations POST No Campaign Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_action' });
  });

  it('proposes a clean activation and lands it awaiting_approval with no guardrail violations', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Campaign Activations POST Clean Org');
    const target = await seedPausedCampaignTarget(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; status: string; guardrailViolations: unknown[] };
    expect(body.id).toEqual(expect.any(String));
    expect(body.status).toBe('awaiting_approval');
    expect(body.guardrailViolations).toEqual([]);
  });
});
