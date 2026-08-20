import { NextResponse, type NextRequest } from 'next/server';
import { SegmentNotFoundError } from '@growthos/firebase-orm-models';
import { deleteSegment } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; segmentId: string }>;
}

/** Deletes a segment outright (see `deleteSegment`'s own doc comment for why a segment, like a goal or board, has no keep-forever audit requirement of its own). */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, segmentId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await deleteSegment(orgId, projectId, segmentId, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof SegmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
