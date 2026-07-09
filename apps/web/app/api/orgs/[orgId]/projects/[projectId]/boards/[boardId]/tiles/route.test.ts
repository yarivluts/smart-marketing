import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createBoard, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, registerMetricDefinition } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { PUT } from './route';

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
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'ad_spend',
    definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
  return { ownerSession, owner, organization, project, board };
}

function putRequest(
  orgId: string,
  projectId: string,
  boardId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; boardId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/boards/${boardId}/tiles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, boardId }),
  };
}

const validTile = {
  id: 'tile-1',
  type: 'big_number',
  title: 'Ad spend',
  layout: { x: 0, y: 0, w: 3, h: 2 },
  metricNames: ['ad_spend'],
  dimensions: [],
};

describe('PUT /api/orgs/[orgId]/projects/[projectId]/boards/[boardId]/tiles', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = putRequest('org-1', 'project-1', 'board-1', { tiles: [] });
    const response = await PUT(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a board id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectBoard('Board Tiles Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = putRequest(organization.id, project.id, 'does-not-exist', { tiles: [] });
    const response = await PUT(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects a malformed tile shape', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('Board Tiles Malformed Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = putRequest(organization.id, project.id, board.id, { tiles: [{ id: 'x' }] });
    const response = await PUT(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects a tile referencing an unregistered metric (business validation, not shape)', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('Board Tiles Unknown Metric Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = putRequest(organization.id, project.id, board.id, {
      tiles: [{ ...validTile, metricNames: ['does_not_exist'] }],
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_board' });
  });

  it('saves a valid tile layout (KAN-60 AC: layout persists)', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('Board Tiles Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = putRequest(organization.id, project.id, board.id, { tiles: [validTile] });
    const response = await PUT(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { board: { tiles: Array<{ id: string }> } };
    expect(body.board.tiles).toHaveLength(1);
    expect(body.board.tiles[0].id).toBe('tile-1');
  });
});
