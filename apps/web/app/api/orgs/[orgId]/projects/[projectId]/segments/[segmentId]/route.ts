import { NextResponse, type NextRequest } from 'next/server';
import { InvalidSegmentError, SegmentNotFoundError, type SegmentModel } from '@growthos/firebase-orm-models';
import { assignSegmentOwner, deleteSegment, updateSegmentStatus } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateSegmentWorkListRequestBody } from '@/lib/orgs/parse-segment-fields';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';

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

/**
 * Assigns a segment's work-list owner and/or ticks its status (KAN-81,
 * E14.x) — the "owner assignment, status ticking" half of plan `14 §Gap 5`'s
 * "live list" upgrade to KAN-76's saved segments. Gated on the same
 * `dashboards.write` permission every other segment mutation on this route
 * uses.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, segmentId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateSegmentWorkListRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    let segment: SegmentModel | undefined;
    if (parsed.ownerPersonId !== undefined) {
      segment = await assignSegmentOwner(orgId, projectId, segmentId, parsed.ownerPersonId, user.id);
    }
    if (parsed.status !== undefined) {
      segment = await updateSegmentStatus(orgId, projectId, segmentId, parsed.status, user.id);
    }
    // `parseUpdateSegmentWorkListRequestBody` guarantees at least one of the two branches above ran.
    return NextResponse.json({ segment: toSegmentSummaryView(segment as SegmentModel) });
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
