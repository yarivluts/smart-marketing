import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  claimTvPairing,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  requestTvPairing,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function boardRequest(token: string | undefined, boardId: string | undefined): NextRequest {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (boardId) params.set('boardId', boardId);
  return new NextRequest(`https://growthos.test/api/tv-pairing/board?${params.toString()}`);
}

async function setupClaimedPairing(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
  const otherBoard = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Revenue', createdByUserId: owner.id });
  const { deviceToken, code } = await requestTvPairing();
  await claimTvPairing({
    organizationId: organization.id,
    projectId: project.id,
    code,
    boardIds: [board.id],
    rotationSeconds: 20,
    reducedMotion: false,
    label: 'Board Test TV',
    claimedByUserId: owner.id,
  });
  return { owner, organization, project, board, otherBoard, deviceToken };
}

describe('GET /api/tv-pairing/board', () => {
  it('rejects a missing token', async () => {
    const response = await GET(boardRequest(undefined, 'board-1'));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const response = await GET(boardRequest('not-a-real-token', 'board-1'));
    expect(response.status).toBe(401);
  });

  it("404s for a board id this pairing wasn't scoped to at claim time, even though it's a real board in the same project", async () => {
    const { deviceToken, otherBoard } = await setupClaimedPairing('TV Board Scope Org');
    const response = await GET(boardRequest(deviceToken, otherBoard.id));
    expect(response.status).toBe(404);
  });

  it('404s for a completely fabricated board id identically to the real-but-unscoped one above', async () => {
    const { deviceToken } = await setupClaimedPairing('TV Board Fake Org');
    const response = await GET(boardRequest(deviceToken, 'does-not-exist-board'));
    expect(response.status).toBe(404);
  });

  it('returns tile data for a board this pairing is scoped to', async () => {
    const { deviceToken, board } = await setupClaimedPairing('TV Board Happy Org');
    const response = await GET(boardRequest(deviceToken, board.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; name: string; tiles: unknown[] };
    expect(body).toMatchObject({ id: board.id, name: 'Marketing', tiles: [] });
  });
});
