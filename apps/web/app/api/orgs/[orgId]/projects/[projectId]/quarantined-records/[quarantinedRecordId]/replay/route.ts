import { NextResponse } from 'next/server';
import { QuarantinedRecordNotFoundError } from '@growthos/firebase-orm-models';
import { replayQuarantinedRecord } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; quarantinedRecordId: string }>;
}

/**
 * Replays one quarantined record (KAN-34 AC: "replay after schema fix succeeds") from the admin
 * console — gated on `ingest.write`, the same permission the ingest-health page itself requires, since
 * this route only ever acts on a record already visible through that page.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, quarantinedRecordId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const result = await replayQuarantinedRecord({ organizationId: orgId, projectId, quarantinedRecordId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof QuarantinedRecordNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
