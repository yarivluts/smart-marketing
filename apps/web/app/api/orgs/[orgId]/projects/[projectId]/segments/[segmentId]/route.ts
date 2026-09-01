import { NextResponse, type NextRequest } from 'next/server';
import { InvalidSegmentError, SegmentNotFoundError, type SegmentModel } from '@growthos/firebase-orm-models';
import { assignSegmentOwner, deleteSegment, updateSegmentDefinition, updateSegmentStatus } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseUpdateSegmentRequestBody } from '@/lib/orgs/parse-segment-fields';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; segmentId: string }>;
}

/** Deletes a segment outright (see `deleteSegment`'s own doc comment for why a segment, like a goal or board, has no keep-forever audit requirement of its own). */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, segmentId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'dashboards.write');
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
 * Updates a segment in one of two mutually-exclusive ways (KAN-81, KAN-120),
 * dispatching on which fields the body names: assigning its work-list owner
 * and/or ticking its status (the "owner assignment, status ticking" half of
 * plan `14 §Gap 5`'s "live list" upgrade to KAN-76's saved segments), or a
 * full replace of its own definition — name, entity schema, filters, and
 * cross-schema event conditions (KAN-120, the same "create + list only, no
 * way to fix a typo'd definition" gap KAN-100/KAN-117 already closed for
 * the people registry and resource templates). Gated on the same
 * `dashboards.write` permission every other segment mutation on this route
 * uses.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, segmentId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateSegmentRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    if (parsed.kind === 'definition') {
      const segment = await updateSegmentDefinition(
        orgId,
        projectId,
        segmentId,
        { name: parsed.name, schemaName: parsed.schemaName, filters: parsed.filters, eventConditions: parsed.eventConditions },
        user.id,
      );
      return NextResponse.json({ segment: toSegmentSummaryView(segment) });
    }

    let segment: SegmentModel | undefined;
    if (parsed.ownerPersonId !== undefined) {
      segment = await assignSegmentOwner(orgId, projectId, segmentId, parsed.ownerPersonId, user.id);
    }
    if (parsed.status !== undefined) {
      segment = await updateSegmentStatus(orgId, projectId, segmentId, parsed.status, user.id);
    }
    // `parseUpdateSegmentRequestBody`'s worklist branch guarantees at least one of the two branches above ran.
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
