import { NextResponse } from 'next/server';
import { HookEndpointNotFoundError } from '@growthos/firebase-orm-models';
import { revokeHookEndpoint } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }>;
}

/** Revokes a hook endpoint immediately (KAN-53) — gated on `ingest.write`, same as minting. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookEndpointId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await revokeHookEndpoint({ organizationId: orgId, projectId, hookEndpointId, revokedByUserId: user.id });
    return NextResponse.json({ status: 'revoked' });
  } catch (err) {
    if (err instanceof HookEndpointNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
