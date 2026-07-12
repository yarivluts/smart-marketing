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

function winFeedRequest(token?: string): NextRequest {
  return new NextRequest(`https://growthos.test/api/tv-pairing/win-feed${token ? `?token=${encodeURIComponent(token)}` : ''}`);
}

describe('GET /api/tv-pairing/win-feed', () => {
  it('rejects a missing token before opening a stream', async () => {
    const response = await GET(winFeedRequest());
    expect(response.status).toBe(401);
  });

  it('rejects an unclaimed token before opening a stream', async () => {
    const { deviceToken } = await requestTvPairing();
    const response = await GET(winFeedRequest(deviceToken));
    expect(response.status).toBe(401);
  });

  it('opens an SSE stream for a claimed pairing', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'TV Win Feed Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
    const { deviceToken, code } = await requestTvPairing();
    await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Win Feed Test TV',
      claimedByUserId: owner.id,
    });

    const response = await GET(winFeedRequest(deviceToken));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(value)).toContain('retry: 2000');
  });
});
