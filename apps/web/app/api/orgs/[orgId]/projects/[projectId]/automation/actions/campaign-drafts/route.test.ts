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

function campaignDraftsUrl(orgId: string, projectId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-drafts`;
}

function postRequest(orgId: string, projectId: string, body: string): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(campaignDraftsUrl(orgId, projectId), {
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

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/campaign-drafts', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', JSON.stringify({ targetId: 'x', draft: campaignDraft() }));
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization } = await setupOrgWithProject('Campaign Drafts POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, 'some-project', JSON.stringify({ targetId: 'x', draft: campaignDraft() }));
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Drafts POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 target_id_required when targetId is missing or blank', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Drafts POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = postRequest(organization.id, project.id, JSON.stringify({ draft: campaignDraft() }));
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const blank = postRequest(organization.id, project.id, JSON.stringify({ targetId: '   ', draft: campaignDraft() }));
    const blankResponse = await POST(blank.request, { params: blank.params });
    expect(blankResponse.status).toBe(400);
    expect(await blankResponse.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 400 draft_required when draft is missing, null, or not an object', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Drafts POST Missing Draft Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'campaign-1' }));
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const nullDraft = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'campaign-1', draft: null }));
    expect((await POST(nullDraft.request, { params: nullDraft.params })).status).toBe(400);

    const stringDraft = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'campaign-1', draft: 'not an object' }));
    const stringResponse = await POST(stringDraft.request, { params: stringDraft.params });
    expect(stringResponse.status).toBe(400);
    expect(await stringResponse.json()).toEqual({ error: 'draft_required' });
  });

  it('returns 404 not_found for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Campaign Drafts POST Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, 'does-not-exist', JSON.stringify({ targetId: 'campaign-1', draft: campaignDraft() }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 404 not_found for a target id that does not exist in the project', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Campaign Drafts POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'does-not-exist', draft: campaignDraft() }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_campaign_draft with the validator message forwarded, for a draft that fails RSA shape rules', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Campaign Drafts POST Invalid Draft Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const invalidDraft = campaignDraft();
    invalidDraft.adGroups[0].responsiveSearchAd.headlines = ['Only One Headline'];

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, draft: invalidDraft }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_campaign_draft');
    expect(body.message).toContain('adGroups[0].responsiveSearchAd.headlines must have between 3 and 15 entries');
  });

  it('returns 400 invalid_campaign_draft for a target that already has a campaign created', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Campaign Drafts POST Already Has Campaign Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 0);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, draft: campaignDraft() }));
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(201);
    const { id: firstActionId } = (await firstResponse.json()) as { id: string };
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: firstActionId, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: firstActionId, executedByUserId: owner.id });

    const second = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, draft: campaignDraft() }));
    const secondResponse = await POST(second.request, { params: second.params });
    expect(secondResponse.status).toBe(400);
    const body = (await secondResponse.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_campaign_draft');
    expect(body.message).toContain('already has a campaign created');
  });

  it('proposes a clean campaign draft and lands it awaiting_approval with no guardrail violations', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Campaign Drafts POST Clean Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, draft: campaignDraft() }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; status: string; guardrailViolations: unknown[] };
    expect(body.id).toEqual(expect.any(String));
    expect(body.status).toBe('awaiting_approval');
    expect(body.guardrailViolations).toEqual([]);
  });
});
