import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, createWinRule, ensureUserForFirebaseSession, registerSchemaDefinition } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE, PATCH } from './route';

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

async function setupOrgProjectWithRule(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'signup',
    fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  const rule = await createWinRule({
    organizationId: organization.id,
    projectId: project.id,
    name: 'New signup',
    schemaName: 'signup',
    filters: [],
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, rule };
}

function winRuleRequest(
  orgId: string,
  projectId: string,
  winRuleId: string,
  method: 'PATCH' | 'DELETE',
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; winRuleId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/win-rules/${winRuleId}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, winRuleId }),
  };
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/win-rules/[winRuleId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = winRuleRequest('org-1', 'project-1', 'rule-1', 'PATCH', { active: false });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a win rule that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectWithRule('Win Rule Patch Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRuleRequest(organization.id, project.id, 'does-not-exist', 'PATCH', { active: false });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('toggles a win rule active flag', async () => {
    const { ownerSession, organization, project, rule } = await setupOrgProjectWithRule('Win Rule Patch Toggle Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRuleRequest(organization.id, project.id, rule.id, 'PATCH', { active: false });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { winRule: { active: boolean } };
    expect(body.winRule.active).toBe(false);
  });

  it('rejects an invalid update (400, business rule)', async () => {
    const { ownerSession, organization, project, rule } = await setupOrgProjectWithRule('Win Rule Patch Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRuleRequest(organization.id, project.id, rule.id, 'PATCH', { name: '   ' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/win-rules/[winRuleId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = winRuleRequest('org-1', 'project-1', 'rule-1', 'DELETE');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a win rule that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectWithRule('Win Rule Delete Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRuleRequest(organization.id, project.id, 'does-not-exist', 'DELETE');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('deletes a win rule', async () => {
    const { ownerSession, organization, project, rule } = await setupOrgProjectWithRule('Win Rule Delete Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRuleRequest(organization.id, project.id, rule.id, 'DELETE');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);
  });
});
