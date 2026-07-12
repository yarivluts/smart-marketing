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

function statusRequest(token?: string): NextRequest {
  return new NextRequest(`https://growthos.test/api/tv-pairing/status${token ? `?token=${encodeURIComponent(token)}` : ''}`);
}

describe('GET /api/tv-pairing/status', () => {
  it('reports invalid for a missing token — never a 401, the poll loop itself needs a body to read', async () => {
    const response = await GET(statusRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'invalid' });
  });

  it('reports invalid for a token that was never minted, identical to a garbage string — no oracle for "does this token exist"', async () => {
    const responseA = await GET(statusRequest('never-minted-token'));
    const responseB = await GET(statusRequest('also-never-minted'));
    const bodyA = await responseA.json();
    expect(bodyA).toEqual({ status: 'invalid' });
    expect(await responseB.json()).toEqual(bodyA);
  });

  it('reports pending for a freshly minted, unclaimed token', async () => {
    const { deviceToken, codeExpiresAt } = await requestTvPairing();
    const response = await GET(statusRequest(deviceToken));
    expect(await response.json()).toEqual({ status: 'pending', codeExpiresAt });
  });

  it('reports claimed with the assigned scope once an admin redeems the code', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'TV Status Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { deviceToken, code } = await requestTvPairing();
    await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 25,
      reducedMotion: true,
      label: 'Status Test TV',
      claimedByUserId: owner.id,
    });

    const response = await GET(statusRequest(deviceToken));
    expect(await response.json()).toEqual({
      status: 'claimed',
      organizationId: organization.id,
      projectId: project.id,
      boardIds: [board.id],
      rotationSeconds: 25,
      reducedMotion: true,
      label: 'Status Test TV',
    });
  });
});
