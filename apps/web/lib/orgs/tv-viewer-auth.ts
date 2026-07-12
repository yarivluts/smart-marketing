import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { TvPairingModel } from '@growthos/firebase-orm-models';
import { requireClaimedTvPairing } from '@/lib/orgs/queries';

export type TvViewerResult =
  | { pairing: TvPairingModel; organizationId: string; projectId: string; error?: undefined }
  | { pairing?: undefined; organizationId?: undefined; projectId?: undefined; error: NextResponse };

/**
 * The session-less counterpart to `requireOrgPermission` (`access.ts`) for
 * every `app/api/tv-pairing/*` route: a paired TV browser has no GrowthOS
 * session cookie at all, so it authenticates by presenting the device secret
 * it was handed at pairing time (`?token=`) instead — the same "possession
 * of a high-entropy secret, not org membership" auth model KAN-49's Stripe
 * webhook route already established for its own session-less caller (see
 * that route's `route-isolation-guard.test.ts` exemption). These routes live
 * outside `app/api/orgs` entirely (a TV that hasn't been claimed yet has no
 * org to scope a path under), so they're outside that guard's scan and don't
 * need an entry there — but they get the identical non-enumeration
 * treatment on their own terms: every rejection reason (no token, unknown
 * token, not yet claimed, expired, revoked) collapses to the same 401
 * `{ error: 'unauthorized' }` body, so a caller probing this endpoint can't
 * distinguish "wrong secret" from "right secret, wrong lifecycle state" —
 * see `tv-viewer-isolation.test.ts`.
 */
export async function requireTvViewer(request: NextRequest): Promise<TvViewerResult> {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }

  const result = await requireClaimedTvPairing(token);
  if (!result.ok) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }

  // `claimTvPairing` always sets `organization_id`/`project_id` together with
  // `claimed = true` (see its own doc comment) — this null-check exists only
  // as defense in depth, not a state this codebase's own write path can
  // actually produce.
  const { organization_id: organizationId, project_id: projectId } = result.value;
  if (!organizationId || !projectId) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }

  return { pairing: result.value, organizationId, projectId };
}
