import { NextResponse } from 'next/server';
import { McpOAuthGrantNotFoundError } from '@growthos/firebase-orm-models';
import { revokeMcpOAuthGrant } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; grantId: string }>;
}

/** Revokes an MCP OAuth connection immediately (KAN-75) — gated on `keys.manage`, same as API key revocation, and revocable by any project admin, not only the user who originally approved it (see `revokeMcpOAuthGrant`'s own doc comment). */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, grantId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'keys.manage');
  if (error) {
    return error;
  }

  try {
    await revokeMcpOAuthGrant({ organizationId: orgId, projectId, grantId, revokedByUserId: user.id });
    return NextResponse.json({ status: 'revoked' });
  } catch (err) {
    if (err instanceof McpOAuthGrantNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
