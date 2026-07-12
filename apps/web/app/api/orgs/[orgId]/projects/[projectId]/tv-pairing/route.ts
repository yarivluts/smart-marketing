import { NextResponse, type NextRequest } from 'next/server';
import { InvalidTvPairingError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { claimTvPairing } from '@/lib/orgs/mutations';
import { listTvPairingsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseClaimTvPairingRequestBody } from '@/lib/orgs/parse-tv-pairing-fields';
import { toTvPairingSummaryView } from '@/lib/orgs/tv-pairing-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Every TV currently paired to this project (KAN-67) — gated on `dashboards.write`, the same permission every other war-room admin surface (boards, goals, win rules) in this codebase reuses. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const pairings = await listTvPairingsForProject(orgId, projectId);
    return NextResponse.json({ pairings: pairings.map(toTvPairingSummaryView) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Redeems a pairing code a TV is currently displaying (KAN-67 AC: "device pairing code"), scoping it to this project and the board(s)/rotation settings the admin chose. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseClaimTvPairingRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const pairing = await claimTvPairing({
      organizationId: orgId,
      projectId,
      code: parsed.code,
      boardIds: parsed.boardIds,
      rotationSeconds: parsed.rotationSeconds,
      reducedMotion: parsed.reducedMotion,
      label: parsed.label,
      claimedByUserId: user.id,
    });
    return NextResponse.json({ pairing: toTvPairingSummaryView(pairing) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidTvPairingError) {
      return NextResponse.json({ error: 'invalid_tv_pairing', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
