import { NextResponse, type NextRequest } from 'next/server';
import { AdShareLinkNotFoundError, revokeAdShareLink } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; linkId: string }>;
}

/** Revokes a client share link at once; the client then sees "link no longer active". `project.configure`. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, linkId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    return NextResponse.json({ link: await revokeAdShareLink({ organizationId: orgId, projectId, linkId, actorId: user.id }) });
  } catch (err) {
    if (err instanceof AdShareLinkNotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return adStudioErrorResponse(err);
  }
}
