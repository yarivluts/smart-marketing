import { NextResponse, type NextRequest } from 'next/server';
import { HookDeliveryNotFoundError } from '@growthos/firebase-orm-models';
import { setHookDeliveryStatus } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookDeliveryId: string }>;
}

/** Marks a queued delivery `reviewed` or `discarded` (KAN-53's review queue) — gated on `ingest.write`. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookDeliveryId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ status?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { status } = parsed.body;
  if (status !== 'reviewed' && status !== 'discarded') {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  try {
    const delivery = await setHookDeliveryStatus({
      organizationId: orgId,
      projectId,
      hookDeliveryId,
      status,
      actedByUserId: user.id,
    });
    return NextResponse.json({ status: delivery.status });
  } catch (err) {
    if (err instanceof HookDeliveryNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
