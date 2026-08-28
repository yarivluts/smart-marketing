import { NextResponse } from 'next/server';
import { ResourceNotFoundError } from '@growthos/firebase-orm-models';
import { unarchiveResourceTemplate } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; templateId: string }>;
}

/** Restores an archived template's pickability (KAN-129 follow-up to `archiveResourceTemplate`) — gated on `resources.manage`, same as archiving. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, templateId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  try {
    await unarchiveResourceTemplate({ organizationId: orgId, templateId, unarchivedByUserId: user.id });
    return NextResponse.json({ status: 'active' });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
