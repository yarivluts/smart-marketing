import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  requestResourceAttachment,
} from '@growthos/firebase-orm-models';
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

function targetsUrl(orgId: string, projectId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/targets`;
}

function getRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(targetsUrl(orgId, projectId), { method: 'GET' }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

function postRequest(
  orgId: string,
  projectId: string,
  body: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(targetsUrl(orgId, projectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

async function setupViewerSession(organizationId: string, ownerId: string): Promise<DecodedIdToken> {
  const viewerEmail = uniqueEmail('viewer');
  const invitation = await inviteMemberToOrganization({
    organizationId,
    email: viewerEmail,
    role: 'viewer',
    invitedByUserId: ownerId,
  });
  const viewerSession = await sessionFor(unique('uid'), viewerEmail);
  const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });
  return viewerSession;
}

/** An approved credential connection this project can link a target to (KAN-74's write-tier gate). */
async function seedApprovedCredentialAttachment(organizationId: string, projectId: string, ownerId: string) {
  const credential = await createSharedCredential({
    organizationId,
    name: 'Agency Google Ads MCC',
    provider: 'google_ads',
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
  return attachment;
}

function validPostBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    targetId: unique('campaign'),
    environmentId: 'live',
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd: 100,
    ...overrides,
  });
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/automation/targets', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = getRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Targets GET Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns an empty targets list for a project id that does not exist in the org (no project-existence check on the read path)', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Targets GET Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = getRequest(organization.id, 'does-not-exist');
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ targets: [] });
  });

  it('returns the full mapped target shape for every target seeded in the project', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Targets GET Shape Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
    });
    const second = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'staging',
      targetId: unique('campaign'),
      targetType: 'ad_group',
      label: 'Winter Sale',
      initialDailyBudgetUsd: 50,
      seededByUserId: owner.id,
    });

    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { targets: Array<Record<string, unknown>> };
    expect(body.targets).toHaveLength(2);
    const byId = new Map(body.targets.map((target) => [target.id, target]));
    // `updated_at` is one of @arbel/firebase-orm's reserved BaseModel fields (`BaseModel.UPDATED_AT_FLAG`):
    // every `.save()` overwrites it with `Date.getTime()` (a number), regardless of the model's own
    // `updated_at!: string` field type or the ISO-string value the service assigns before saving.
    expect(byId.get(first.id)).toEqual({
      id: first.id,
      targetType: 'campaign',
      label: 'Summer Sale',
      dailyBudgetUsd: 100,
      environmentId: 'live',
      updatedAt: expect.any(Number),
    });
    expect(byId.get(second.id)).toEqual({
      id: second.id,
      targetType: 'ad_group',
      label: 'Winter Sale',
      dailyBudgetUsd: 50,
      environmentId: 'staging',
      updatedAt: expect.any(Number),
    });
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/targets', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', validPostBody());
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Targets POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, validPostBody());
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 target_id_required when targetId is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Missing TargetId Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ environmentId: 'live', targetType: 'campaign', label: 'Summer Sale', initialDailyBudgetUsd: 100 }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 400 target_id_required when targetId is a blank string', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Blank TargetId Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, validPostBody({ targetId: '   ' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 400 environment_id_required when environmentId is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Missing EnvId Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: unique('campaign'), targetType: 'campaign', label: 'Summer Sale', initialDailyBudgetUsd: 100 }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'environment_id_required' });
  });

  it('returns 400 target_type_required when targetType is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Missing TargetType Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: unique('campaign'), environmentId: 'live', label: 'Summer Sale', initialDailyBudgetUsd: 100 }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'target_type_required' });
  });

  it('returns 400 label_required when label is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Missing Label Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: unique('campaign'), environmentId: 'live', targetType: 'campaign', initialDailyBudgetUsd: 100 }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'label_required' });
  });

  it('returns 400 initial_daily_budget_usd_required when the field is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Missing Budget Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ targetId: unique('campaign'), environmentId: 'live', targetType: 'campaign', label: 'Summer Sale' }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'initial_daily_budget_usd_required' });
  });

  it('returns 400 initial_daily_budget_usd_required when the field is the wrong type', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Wrong Type Budget Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, validPostBody({ initialDailyBudgetUsd: '100' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'initial_daily_budget_usd_required' });
  });

  it('returns 400 invalid_resource_attachment_id when resourceAttachmentId is a blank string', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Blank Attachment Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, validPostBody({ resourceAttachmentId: '   ' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_resource_attachment_id' });
  });

  it('returns 404 not_found for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Targets POST Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, 'does-not-exist', validPostBody());
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_request for a negative budget (passes the route type check, fails the service-level range check)', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Negative Budget Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, validPostBody({ initialDailyBudgetUsd: -5 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('returns 400 invalid_request for a resourceAttachmentId that is a non-blank string but does not resolve to an approved credential connection for this project', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Bad Attachment Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, validPostBody({ resourceAttachmentId: 'does-not-exist' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('seeds a new target and returns 201', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Clean Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, validPostBody({ initialDailyBudgetUsd: 75 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; dailyBudgetUsd: number };
    expect(body.id).toEqual(expect.any(String));
    expect(body.dailyBudgetUsd).toBe(75);
  });

  it('seeds a target linked to an approved credential connection', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Targets POST Linked Org');
    const attachment = await seedApprovedCredentialAttachment(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      validPostBody({ resourceAttachmentId: attachment.id }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
  });

  it('is idempotent: seeding the same targetId twice returns the original target, ignoring the second call\'s different fields', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Targets POST Idempotent Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const targetId = unique('campaign');

    const firstBody = validPostBody({ targetId, label: 'Original Label', initialDailyBudgetUsd: 100 });
    const first = await postRequest(organization.id, project.id, firstBody);
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(201);
    const firstBody_ = (await firstResponse.json()) as { id: string; dailyBudgetUsd: number };

    const secondBody = validPostBody({ targetId, label: 'A Different Label', initialDailyBudgetUsd: 999 });
    const second = await postRequest(organization.id, project.id, secondBody);
    const secondResponse = await POST(second.request, { params: second.params });
    expect(secondResponse.status).toBe(201);
    const secondBody_ = (await secondResponse.json()) as { id: string; dailyBudgetUsd: number };

    expect(secondBody_.id).toBe(firstBody_.id);
    expect(secondBody_.dailyBudgetUsd).toBe(100);

    const { request: listRequest, params: listParams } = getRequest(organization.id, project.id);
    const listResponse = await GET(listRequest, { params: listParams });
    const listBody = (await listResponse.json()) as { targets: Array<Record<string, unknown>> };
    expect(listBody.targets).toHaveLength(1);
    expect(listBody.targets[0]).toMatchObject({ label: 'Original Label', dailyBudgetUsd: 100 });
  });
});
