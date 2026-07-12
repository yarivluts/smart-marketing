import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { TvPairingModel } from '@growthos/firebase-orm-models';
import { requireClaimedTvPairing } from '@/lib/orgs/queries';

export type TvViewerResult =
  | { pairing: TvPairingModel; organizationId: string; projectId: string; error?: undefined }
  | { pairing?: undefined; organizationId?: undefined; projectId?: undefined; error: NextResponse };

/** `Bearer <token>` — mirrors the header shape `ApiKeyAuthGuard` (`apps/api`) already establishes for this codebase's other hashed-bearer-secret scheme, so the device token doesn't ride along in every URL. */
function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/**
 * The device-token extraction every `app/api/tv-pairing/*` route shares:
 * `Authorization: Bearer` first, `?token=` as a fallback for the one caller
 * that can't set a header (`win-feed/route.ts`'s `EventSource`) — see
 * `requireTvViewer`'s own doc comment for the full reasoning. Exported
 * separately from `requireTvViewer` for `status/route.ts`, which needs the
 * raw token but deliberately doesn't use `requireTvViewer`'s 401-on-anything
 * shape (see that route's own doc comment for why an unrecognized token gets
 * a 200 `{status: 'invalid'}` instead).
 */
export function extractTvDeviceToken(request: NextRequest): string | null {
  return extractBearerToken(request) ?? request.nextUrl.searchParams.get('token');
}

/**
 * The session-less counterpart to `requireOrgPermission` (`access.ts`) for
 * every `app/api/tv-pairing/*` route: a paired TV browser has no GrowthOS
 * session cookie at all, so it authenticates by presenting the device secret
 * it was handed at pairing time instead — the same "possession of a
 * high-entropy secret, not org membership" auth model KAN-49's Stripe
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
 *
 * The token is read from the `Authorization: Bearer` header when present
 * (every plain `fetch()`-based call in `tv-client.ts` sends it this way, so
 * it never lands in a URL — and by extension, in server access logs,
 * intermediate proxy logs, or the TV kiosk browser's own history — for the
 * up-to-48h life of a claimed session). The `?token=` query param is kept as
 * a fallback purely for `win-feed/route.ts`'s `EventSource` caller, which
 * has no way to set a custom request header on a native `EventSource`
 * connection.
 */
export async function requireTvViewer(request: NextRequest): Promise<TvViewerResult> {
  const token = extractTvDeviceToken(request);
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
