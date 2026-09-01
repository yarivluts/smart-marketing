import { NextResponse } from 'next/server';
import { QuarantinedRecordNotActionableError, QuarantinedRecordNotFoundError } from '@growthos/firebase-orm-models';
import { dismissQuarantinedRecord } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; quarantinedRecordId: string }>;
}

/**
 * Permanently discards one quarantined record without replaying it (KAN-131) from the admin console
 * — gated on `ingest.write`, the same permission the ingest-health page and the sibling `replay`
 * route both require, since this route only ever acts on a record already visible through that page.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, quarantinedRecordId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const result = await dismissQuarantinedRecord({
      organizationId: orgId,
      projectId,
      quarantinedRecordId,
      performedByUserId: user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof QuarantinedRecordNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof QuarantinedRecordNotActionableError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    throw err;
  }
}
