import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requestTvPairing } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET as pairingStatus } from '@/app/api/tv-pairing/status/route';
import { GET as pairingRotation } from '@/app/api/tv-pairing/rotation/route';
import { GET as pairingBoard } from '@/app/api/tv-pairing/board/route';
import { GET as pairingWinFeed } from '@/app/api/tv-pairing/win-feed/route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

/**
 * KAN-67's own non-enumeration property (the session-less counterpart to
 * KAN-26's `isolation.test.ts`, see `tv-viewer-auth.ts`'s own doc comment):
 * a caller presenting a token that was never minted, and one presenting a
 * real token that just isn't claimed/scoped for what it's asking for, must
 * be byte-for-byte indistinguishable — the same "no oracle" bar
 * `expectIndistinguishable` (`isolation.test.ts`) enforces for org
 * membership, applied here to device-token possession instead.
 */
async function expectIndistinguishable(callA: () => Promise<Response>, callB: () => Promise<Response>): Promise<void> {
  const [responseA, responseB] = await Promise.all([callA(), callB()]);
  expect(responseA.status).toBe(responseB.status);
  expect(await responseA.json()).toEqual(await responseB.json());
}

describe('tv-pairing viewer routes: unminted token vs. a real-but-unauthorized token (KAN-67)', () => {
  it('GET /api/tv-pairing/status reports identically invalid for both', async () => {
    await expectIndistinguishable(
      () => pairingStatus(new NextRequest('https://growthos.test/api/tv-pairing/status?token=never-minted')),
      () => pairingStatus(new NextRequest('https://growthos.test/api/tv-pairing/status?token=also-never-minted')),
    );
  });

  it('GET /api/tv-pairing/rotation rejects identically for an unminted token vs. an unclaimed real one', async () => {
    const { deviceToken } = await requestTvPairing();
    await expectIndistinguishable(
      () => pairingRotation(new NextRequest('https://growthos.test/api/tv-pairing/rotation?token=never-minted')),
      () => pairingRotation(new NextRequest(`https://growthos.test/api/tv-pairing/rotation?token=${deviceToken}`)),
    );
  });

  it('GET /api/tv-pairing/board rejects identically for an unminted token vs. an unclaimed real one', async () => {
    const { deviceToken } = await requestTvPairing();
    await expectIndistinguishable(
      () => pairingBoard(new NextRequest('https://growthos.test/api/tv-pairing/board?token=never-minted&boardId=x')),
      () => pairingBoard(new NextRequest(`https://growthos.test/api/tv-pairing/board?token=${deviceToken}&boardId=x`)),
    );
  });

  it('GET /api/tv-pairing/win-feed rejects identically for an unminted token vs. an unclaimed real one', async () => {
    const { deviceToken } = await requestTvPairing();
    await expectIndistinguishable(
      () => pairingWinFeed(new NextRequest('https://growthos.test/api/tv-pairing/win-feed?token=never-minted')),
      () => pairingWinFeed(new NextRequest(`https://growthos.test/api/tv-pairing/win-feed?token=${deviceToken}`)),
    );
  });
});
