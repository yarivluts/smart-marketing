import { NextResponse } from 'next/server';
import { FieldMappingNotFoundError } from '@growthos/firebase-orm-models';
import { disableFieldMapping } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; fieldMappingId: string }>;
}

/** Retires a field mapping immediately (KAN-54) — gated on `ingest.write`, same as creating one. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, fieldMappingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await disableFieldMapping({ organizationId: orgId, projectId, fieldMappingId, disabledByUserId: user.id });
    return NextResponse.json({ status: 'disabled' });
  } catch (err) {
    if (err instanceof FieldMappingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
