import { NextResponse } from 'next/server';
import { requestTvPairing } from '@/lib/orgs/mutations';

/**
 * Mints a brand-new, unclaimed TV pairing (KAN-67 AC: "device pairing code,
 * no login on the TV itself"). Deliberately public — a TV browser has no
 * GrowthOS session and no org/project context yet, so there is nothing to
 * gate this on (see `TvPairingModel`'s own doc comment). This route lives
 * outside `app/api/orgs`, so `route-isolation-guard.test.ts` doesn't scan
 * it; see `tv-viewer-auth.ts`'s own doc comment for this endpoint family's
 * actual non-enumeration posture.
 */
export async function POST(): Promise<NextResponse> {
  const result = await requestTvPairing();
  return NextResponse.json(
    { deviceToken: result.deviceToken, code: result.code, codeExpiresAt: result.codeExpiresAt },
    { status: 201 },
  );
}
