import { NextResponse, type NextRequest } from 'next/server';
import { InvalidSegmentError, SegmentNotFoundError } from '@growthos/firebase-orm-models';
import { deleteSegment, updateSegmentWorklist } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateSegmentWorklistRequestBody } from '@/lib/orgs/parse-segment-fields';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; segmentId: string }>;
}

/**
 * Assigns/clears a segment's worklist owner and/or ticks its status
 * (KAN-81). Every field is optional — only what's sent is changed, the same
 * convention the boards settings PATCH route establishes.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, segmentId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateSegmentWorklistRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const segment = await updateSegmentWorklist({
      organizationId: orgId,
      projectId,
      segmentId,
      updatedByUserId: user.id,
      ...(parsed.ownerPersonId !== undefined ? { ownerPersonId: parsed.ownerPersonId } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    });
    return NextResponse.json({ segment: toSegmentSummaryView(segment) });
  } catch (err) {
    if (err instanceof SegmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSegmentError) {
      return NextResponse.json({ error: 'invalid_segment', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
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
