import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, registerSchemaDefinition } from '@growthos/firebase-orm-models';
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

function funnelRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/onboarding/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/onboarding/funnel', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = funnelRequest('org-1', 'project-1', { steps: [] });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a non-array steps payload and an unrecognized stageKey', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Funnel Route Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const notArray = funnelRequest(organization.id, project.id, { steps: 'nope' });
    expect((await POST(notArray.request, { params: notArray.params })).status).toBe(400);

    const badStage = funnelRequest(organization.id, project.id, { steps: [{ eventSchemaName: 'signup', stageKey: 'not-a-stage' }] });
    expect((await POST(badStage.request, { params: badStage.params })).status).toBe(400);
  });

  it('persists the confirmed order and advances to "board"', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Onboarding Funnel Route Confirm Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'user_signed_up',
      fields: [],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = funnelRequest(organization.id, project.id, {
      steps: [{ eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 }],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: { funnelSteps: unknown[]; step: string } };
    expect(body.state.funnelSteps).toEqual([{ eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 }]);
    expect(body.state.step).toBe('board');
  });
});
