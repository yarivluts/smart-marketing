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
  listAutomationTargetStatesForProject,
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

/** Seeds a target and executes a `campaign_draft_create` against it, so `ad_group_resource_names` is populated. */
async function seedTargetWithCreatedCampaign(organizationId: string, projectId: string, ownerId: string) {
  const target = await seedTarget(organizationId, projectId, ownerId, 0);
  const created = await proposeCampaignDraftCreateAction({ organizationId, projectId, targetId: target.id, draft: campaignDraft(), requestedByUserId: ownerId });
  await approveAutomationAction({ organizationId, projectId, actionId: created.id, approverId: ownerId });
  await executeAutomationAction({ organizationId, projectId, actionId: created.id, executedByUserId: ownerId });
  const [reloaded] = await listAutomationTargetStatesForProject(organizationId, projectId);
  return reloaded;
}

function keywordEditsUrl(orgId: string, projectId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions/keyword-edits`;
}

function postRequest(orgId: string, projectId: string, body: string): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(keywordEditsUrl(orgId, projectId), {
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

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/keyword-edits', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest(
      'org-1',
      'project-1',
      JSON.stringify({ targetId: 'x', adGroupResourceName: 'customers/1/adGroups/1', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization } = await setupOrgWithProject('Keyword Edits POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(
      organization.id,
      'some-project',
      JSON.stringify({ targetId: 'x', adGroupResourceName: 'customers/1/adGroups/1', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Keyword Edits POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 target_id_required when targetId is missing or blank', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Keyword Edits POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ adGroupResourceName: 'customers/1/adGroups/1', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const blank = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: '   ', adGroupResourceName: 'customers/1/adGroups/1', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    const blankResponse = await POST(blank.request, { params: blank.params });
    expect(blankResponse.status).toBe(400);
    expect(await blankResponse.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 400 ad_group_resource_name_required when it is missing or blank', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Keyword Edits POST Missing AdGroup Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'campaign-1', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }));
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const blank = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: 'campaign-1', adGroupResourceName: '  ', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    const blankResponse = await POST(blank.request, { params: blank.params });
    expect(blankResponse.status).toBe(400);
    expect(await blankResponse.json()).toEqual({ error: 'ad_group_resource_name_required' });
  });

  it('returns 404 not_found for a target id that does not exist in the project', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Keyword Edits POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: 'does-not-exist', adGroupResourceName: 'customers/1/adGroups/1', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_keyword_edit for an ad group that is not one of this target\'s own ad groups', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Keyword Edits POST Wrong AdGroup Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: target.id, adGroupResourceName: 'customers/999/adGroups/not-this-targets', addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }] }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_keyword_edit');
    expect(body.message).toContain('own ad groups');
  });

  it('returns 400 invalid_keyword_edit for a no-op edit (both addKeywords and addNegativeKeywords empty)', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Keyword Edits POST Empty Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: target.id, adGroupResourceName: target.ad_group_resource_names?.[0], addKeywords: [], addNegativeKeywords: [] }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe('invalid_keyword_edit');
  });

  it('proposes a clean keyword edit and lands it awaiting_approval with no guardrail violations', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Keyword Edits POST Clean Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({
        targetId: target.id,
        adGroupResourceName: target.ad_group_resource_names?.[0],
        addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
        addNegativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
      }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; status: string; guardrailViolations: unknown[] };
    expect(body.id).toEqual(expect.any(String));
    expect(body.status).toBe('awaiting_approval');
    expect(body.guardrailViolations).toEqual([]);
  });
});
