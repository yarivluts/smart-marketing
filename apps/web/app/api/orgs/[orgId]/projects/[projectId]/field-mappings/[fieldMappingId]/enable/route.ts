import { NextResponse } from 'next/server';
import { FieldMappingNotFoundError } from '@growthos/firebase-orm-models';
import { enableFieldMapping } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; fieldMappingId: string }>;
}

/** Resumes a retired field mapping (KAN-54 follow-up) — gated on `ingest.write`, same as disabling. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, fieldMappingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await enableFieldMapping({ organizationId: orgId, projectId, fieldMappingId, enabledByUserId: user.id });
    return NextResponse.json({ status: 'enabled' });
  } catch (err) {
    if (err instanceof FieldMappingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
