import { NextResponse, type NextRequest } from 'next/server';
import { requestTvPairing } from '@/lib/orgs/mutations';
import { checkMintPairingRateLimit } from '@/lib/orgs/tv-pairing-rate-limit';

/**
 * Mints a brand-new, unclaimed TV pairing (KAN-67 AC: "device pairing code,
 * no login on the TV itself"). Deliberately public — a TV browser has no
 * GrowthOS session and no org/project context yet, so there is nothing to
 * gate this on (see `TvPairingModel`'s own doc comment). This route lives
 * outside `app/api/orgs`, so `route-isolation-guard.test.ts` doesn't scan
 * it; see `tv-viewer-auth.ts`'s own doc comment for this endpoint family's
 * actual non-enumeration posture. Being fully anonymous, it's also the one
 * unbounded write surface a caller could hammer with no org/key to revoke —
 * `checkMintPairingRateLimit` throttles that by caller IP.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = checkMintPairingRateLimit(request);
  if (rateLimited) {
    return rateLimited;
  }

  const result = await requestTvPairing();
  return NextResponse.json(
    { deviceToken: result.deviceToken, code: result.code, codeExpiresAt: result.codeExpiresAt },
    { status: 201 },
  );
}
