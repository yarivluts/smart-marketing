import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createBoard, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
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

async function setupOrgProjectBoard(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
  return { ownerSession, owner, organization, project, board };
}

function patchRequest(
  orgId: string,
  projectId: string,
  boardId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; boardId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, boardId }),
  };
}

function deleteRequest(
  orgId: string,
  projectId: string,
  boardId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; boardId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/boards/${boardId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, boardId }),
  };
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/boards/[boardId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'project-1', 'board-1', { name: 'X' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a board id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectBoard('Board Settings Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'does-not-exist', { name: 'X' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects an invalid date range shape and an invalid compare value', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('Board Settings Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const badRange = patchRequest(organization.id, project.id, board.id, { dateRange: { start: '2026-01-01' } });
    expect((await PATCH(badRange.request, { params: badRange.params })).status).toBe(400);

    const badCompare = patchRequest(organization.id, project.id, board.id, { compare: 'yesterday' });
    expect((await PATCH(badCompare.request, { params: badCompare.params })).status).toBe(400);
  });

  it('renames a board and updates its date range/compare/global filters', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('Board Settings Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, board.id, {
      name: 'Revenue',
      dateRange: { start: '2026-01-01', end: '2026-01-31', grain: 'day' },
      compare: 'previous_period',
      globalFilters: [{ field: 'channel', operator: '=', value: 'google' }],
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { board: { name: string; compare?: string } };
    expect(body.board.name).toBe('Revenue');
    expect(body.board.compare).toBe('previous_period');
  });
});

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/boards/[boardId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'board-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a board id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectBoard('Board Delete Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, 'does-not-exist');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('deletes an existing board', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('Board Delete Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, board.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, board.id);
    expect((await DELETE(second.request, { params: second.params })).status).toBe(404);
  });
});
