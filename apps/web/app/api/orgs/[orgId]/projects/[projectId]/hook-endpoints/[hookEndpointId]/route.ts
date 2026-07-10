import { NextResponse } from 'next/server';
import { HookEndpointNotFoundError } from '@growthos/firebase-orm-models';
import { disableHookEndpoint } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }>;
}

/** Disables a hook endpoint's receive URL immediately (KAN-53) — gated on `ingest.write`, same as creating one. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookEndpointId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await disableHookEndpoint({ organizationId: orgId, projectId, hookEndpointId, disabledByUserId: user.id });
    return NextResponse.json({ status: 'disabled' });
  } catch (err) {
    if (err instanceof HookEndpointNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
