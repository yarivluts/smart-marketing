import { NextResponse, type NextRequest } from 'next/server';
import { InvalidTvPairingError, TvPairingNotFoundError } from '@growthos/firebase-orm-models';
import { revokeTvPairing, updateTvPairingSettings } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateTvPairingSettingsRequestBody } from '@/lib/orgs/parse-tv-pairing-fields';
import { toTvPairingSummaryView } from '@/lib/orgs/tv-pairing-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; pairingId: string }>;
}

/** Revokes a paired TV immediately (KAN-67) — gated on `dashboards.write`, same as claiming. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, pairingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await revokeTvPairing(orgId, projectId, pairingId, user.id);
    return NextResponse.json({ status: 'revoked' });
  } catch (err) {
    if (err instanceof TvPairingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/**
 * Edits an already-claimed TV's own settings — label, board rotation,
 * interval, and reduced-motion (KAN-127, the same "create + list only, no
 * way to fix a typo'd definition" gap KAN-100/117/119/120/121/123/124/125/126
 * already closed for their own sibling registries). Gated on
 * `dashboards.write`, same as claiming/revoking on this route.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, pairingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateTvPairingSettingsRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const pairing = await updateTvPairingSettings({
      organizationId: orgId,
      projectId,
      pairingId,
      label: parsed.label,
      boardIds: parsed.boardIds,
      rotationSeconds: parsed.rotationSeconds,
      reducedMotion: parsed.reducedMotion,
      actorUserId: user.id,
    });
    return NextResponse.json({ pairing: toTvPairingSummaryView(pairing) });
  } catch (err) {
    if (err instanceof TvPairingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidTvPairingError) {
      return NextResponse.json({ error: 'invalid_tv_pairing', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
