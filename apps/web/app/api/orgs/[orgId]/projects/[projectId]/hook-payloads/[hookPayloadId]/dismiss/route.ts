import { NextResponse } from 'next/server';
import { HookPayloadNotFoundError } from '@growthos/firebase-orm-models';
import { dismissHookPayload } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookPayloadId: string }>;
}

/** Dismisses one review-queue payload (KAN-53) — gated on `ingest.write`, same as the hook-endpoints admin surface it sits alongside. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookPayloadId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await dismissHookPayload({ organizationId: orgId, projectId, hookPayloadId, reviewedByUserId: user.id });
    return NextResponse.json({ status: 'dismissed' });
  } catch (err) {
    if (err instanceof HookPayloadNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
