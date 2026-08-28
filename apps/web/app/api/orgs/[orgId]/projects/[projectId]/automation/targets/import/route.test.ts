import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listAutomationTargetStatesForProject,
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

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

function postRequest(
  orgId: string,
  projectId: string,
  body: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/targets/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), `${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalCampaignId: unique('526'),
    platform: 'meta_ads',
    name: 'Brand Awareness Test Campaign',
    status: 'paused',
    dailyBudgetUsd: 1,
    objective: 'OUTCOME_TRAFFIC',
    ads: [
      {
        adSetName: 'Ad Set A',
        adName: 'lawyers | va | image ad',
        status: 'PAUSED',
        headline: 'Sign In Minutes',
        primaryText: 'Contracts signed from the phone in the same call.',
        linkUrl: 'https://example.com/landing',
        imageUrl: 'https://example.com/image.png',
        callToActionType: 'SIGN_UP',
      },
    ],
    ...overrides,
  };
}

function importBody(snapshots: Record<string, unknown>[], environmentId: string = 'live'): string {
  return JSON.stringify({ environmentId, snapshots });
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/targets/import', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', importBody([snapshot()]));
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Import Viewer Org');
    const viewerEmail = `${unique('viewer')}@example.com`;
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
    const { request, params } = postRequest(organization.id, project.id, importBody([snapshot()]));
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 environment_id_required / snapshots_required for a missing envelope', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Import Envelope Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingEnv = postRequest(organization.id, project.id, JSON.stringify({ snapshots: [snapshot()] }));
    const missingEnvResponse = await POST(missingEnv.request, { params: missingEnv.params });
    expect(missingEnvResponse.status).toBe(400);
    expect(await missingEnvResponse.json()).toEqual({ error: 'environment_id_required' });

    const missingSnapshots = postRequest(organization.id, project.id, JSON.stringify({ environmentId: 'live', snapshots: [] }));
    const missingSnapshotsResponse = await POST(missingSnapshots.request, { params: missingSnapshots.params });
    expect(missingSnapshotsResponse.status).toBe(400);
    expect(await missingSnapshotsResponse.json()).toEqual({ error: 'snapshots_required' });
  });

  it('returns 400 invalid_request for a snapshot with an unknown platform or status', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Import Bad Snapshot Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const badPlatform = postRequest(organization.id, project.id, importBody([snapshot({ platform: 'tiktok_ads' })]));
    const badPlatformResponse = await POST(badPlatform.request, { params: badPlatform.params });
    expect(badPlatformResponse.status).toBe(400);
    expect(((await badPlatformResponse.json()) as { error: string }).error).toBe('invalid_request');

    const badStatus = postRequest(organization.id, project.id, importBody([snapshot({ status: 'ACTIVE' })]));
    const badStatusResponse = await POST(badStatus.request, { params: badStatus.params });
    expect(badStatusResponse.status).toBe(400);
    expect(((await badStatusResponse.json()) as { error: string }).error).toBe('invalid_request');
  });

  it('returns 404 not_found for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Import Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, 'does-not-exist', importBody([snapshot()]));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('imports campaigns as target rows (created), then re-import updates the same rows in place (updated)', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Import Upsert Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const externalCampaignId = unique('52619');

    const first = postRequest(
      organization.id,
      project.id,
      importBody([snapshot({ externalCampaignId, name: 'First Name', status: 'paused' }), snapshot()]),
    );
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(201);
    const firstBody = (await firstResponse.json()) as { created: number; updated: number; targetIds: string[] };
    expect(firstBody.created).toBe(2);
    expect(firstBody.updated).toBe(0);
    expect(firstBody.targetIds[0]).toBe(`meta_ads_${externalCampaignId}`);

    const second = postRequest(
      organization.id,
      project.id,
      importBody([snapshot({ externalCampaignId, name: 'Renamed Campaign', status: 'enabled', dailyBudgetUsd: 7 })]),
    );
    const secondResponse = await POST(second.request, { params: second.params });
    expect(secondResponse.status).toBe(201);
    const secondBody = (await secondResponse.json()) as { created: number; updated: number };
    expect(secondBody.created).toBe(0);
    expect(secondBody.updated).toBe(1);

    const targets = await listAutomationTargetStatesForProject(organization.id, project.id);
    const updated = targets.find((target) => target.id === `meta_ads_${externalCampaignId}`);
    expect(updated).toBeDefined();
    expect(updated?.label).toBe('Renamed Campaign');
    expect(updated?.campaign_status).toBe('enabled');
    expect(updated?.daily_budget_usd).toBe(7);
    expect(updated?.external_platform).toBe('meta_ads');
    expect(updated?.campaign_resource_name).toBe(externalCampaignId);
    expect(updated?.last_read_state_at).toEqual(expect.any(String));
    const importedAds = JSON.parse(updated?.imported_ads_json ?? '{}') as { objective?: string; ads?: Array<{ adName: string }> };
    expect(importedAds.objective).toBe('OUTCOME_TRAFFIC');
    expect(importedAds.ads?.[0]?.adName).toBe('lawyers | va | image ad');
  });
});
