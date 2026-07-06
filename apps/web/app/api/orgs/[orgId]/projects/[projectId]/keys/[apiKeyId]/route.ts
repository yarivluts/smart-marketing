import { NextResponse } from 'next/server';
import { ApiKeyNotFoundError } from '@growthos/firebase-orm-models';
import { revokeApiKey } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; apiKeyId: string }>;
}

/** Revokes a key immediately (KAN-30/KAN-28 AC) — gated on `keys.manage`, same as minting. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, apiKeyId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'keys.manage');
  if (error) {
    return error;
  }

  try {
    await revokeApiKey({ organizationId: orgId, projectId, apiKeyId, revokedByUserId: user.id });
    return NextResponse.json({ status: 'revoked' });
  } catch (err) {
    if (err instanceof ApiKeyNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
