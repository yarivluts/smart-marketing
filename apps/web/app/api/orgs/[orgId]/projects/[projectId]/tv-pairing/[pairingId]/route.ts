import { NextResponse } from 'next/server';
import { TvPairingNotFoundError } from '@growthos/firebase-orm-models';
import { revokeTvPairing } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

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
