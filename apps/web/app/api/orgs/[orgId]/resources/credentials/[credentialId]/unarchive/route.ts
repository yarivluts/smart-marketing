import { NextResponse } from 'next/server';
import { ResourceNotFoundError } from '@growthos/firebase-orm-models';
import { unarchiveSharedCredential } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; credentialId: string }>;
}

/** Restores an archived credential's pickability (KAN-129 follow-up to `archiveSharedCredential`) — gated on `resources.manage`, same as archiving. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, credentialId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  try {
    await unarchiveSharedCredential({ organizationId: orgId, credentialId, unarchivedByUserId: user.id });
    return NextResponse.json({ status: 'active' });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
