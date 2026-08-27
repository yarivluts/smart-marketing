import { NextResponse } from 'next/server';
import { HookEndpointNotFoundError } from '@growthos/firebase-orm-models';
import { enableHookEndpoint } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }>;
}

/** Resumes a disabled hook endpoint's receive URL (KAN-53 follow-up) — gated on `ingest.write`, same as disabling. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookEndpointId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await enableHookEndpoint({ organizationId: orgId, projectId, hookEndpointId, enabledByUserId: user.id });
    return NextResponse.json({ status: 'enabled' });
  } catch (err) {
    if (err instanceof HookEndpointNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
