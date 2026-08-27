import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST as createTemplate } from '../route';
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

function patchRequest(orgId: string, templateId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; templateId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/resources/templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, templateId }),
  };
}

async function setupOrgWithTemplate(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail(orgName.toLowerCase().replace(/\s+/g, '-')));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  getServerSessionMock.mockResolvedValue(ownerSession);

  const createResponse = await createTemplate(
    new NextRequest(`https://growthos.test/api/orgs/${organization.id}/resources/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Original Template', type: 'metric_definition' }),
    }),
    { params: Promise.resolve({ orgId: organization.id }) },
  );
  const { templateId } = (await createResponse.json()) as { templateId: string };

  return { ownerSession, owner, organization, templateId };
}

describe('PATCH /api/orgs/[orgId]/resources/templates/[templateId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'template-1', { name: 'New Name' });
    expect((await PATCH(request, { params })).status).toBe(401);
  });

  it('rejects a member whose role does not hold resources.manage (viewer)', async () => {
    const { owner, organization, templateId } = await setupOrgWithTemplate('Edit Template Owner Org');

    const viewerEmail = uniqueEmail('edit-template-viewer');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = patchRequest(organization.id, templateId, { name: 'Hijacked Name' });
    expect((await PATCH(request, { params })).status).toBe(403);
  });

  it('rejects a request with no name', async () => {
    const { organization, templateId } = await setupOrgWithTemplate('Edit Template No Name Org');
    const { request, params } = patchRequest(organization.id, templateId, {});
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('rejects a non-object config', async () => {
    const { organization, templateId } = await setupOrgWithTemplate('Edit Template Config Validation Org');
    const { request, params } = patchRequest(organization.id, templateId, { name: 'X', config: 'not-an-object' });
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('rejects an array config', async () => {
    const { organization, templateId } = await setupOrgWithTemplate('Edit Template Array Config Org');
    const { request, params } = patchRequest(organization.id, templateId, { name: 'X', config: [1, 2, 3] });
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('returns 404 for a template id that does not exist in this org', async () => {
    const { organization } = await setupOrgWithTemplate('Edit Template Missing Org');
    const { request, params } = patchRequest(organization.id, 'does-not-exist', { name: 'New Name' });
    expect((await PATCH(request, { params })).status).toBe(404);
  });

  it('lets an org_owner edit a template, bumping its version, clearing a previously-set config when omitted', async () => {
    const { organization, templateId } = await setupOrgWithTemplate('Edit Template Happy Org');

    // Set a config first, so clearing it on the next edit is a real assertion, not one that would
    // pass trivially against a template that never had a config to begin with.
    const setConfig = patchRequest(organization.id, templateId, { name: 'Original Template', config: { steps: ['signup'] } });
    await PATCH(setConfig.request, { params: setConfig.params });

    const { request, params } = patchRequest(organization.id, templateId, {
      name: 'Updated Template',
      // config intentionally omitted — should clear the value set above
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { template: { id: string; name: string; version: number; config?: unknown } };
    expect(body.template).toMatchObject({ id: templateId, name: 'Updated Template', version: 3 });
    // `null`, never `undefined` — see `ResourceTemplateModel.config`'s own doc comment: `updateDoc()`
    // drops an `undefined` field instead of clearing it, so this also guards against that regression.
    expect(body.template.config).toBeNull();
  });

  it('persists an edited config object', async () => {
    const { organization, templateId } = await setupOrgWithTemplate('Edit Template Config Org');

    const { request, params } = patchRequest(organization.id, templateId, {
      name: 'Configured Template',
      config: { threshold: 0.4 },
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { template: { config?: unknown } };
    expect(body.template.config).toEqual({ threshold: 0.4 });
  });
});
