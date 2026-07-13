import { NextResponse, type NextRequest } from 'next/server';
import { InvalidSegmentError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { createSegment } from '@/lib/orgs/mutations';
import { listSegmentsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseCreateSegmentRequestBody } from '@/lib/orgs/parse-segment-fields';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists a project's saved segments (KAN-76), newest-first — gated on `dashboards.write`, reusing the goals/boards features' permission. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const segments = await listSegmentsForProject(orgId, projectId);
    return NextResponse.json({ segments: segments.map(toSegmentSummaryView) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/**
 * Creates a segment (KAN-76) through this app's own session-authenticated
 * route — the human-facing counterpart to the MCP `create_segment` act
 * tool, so a human never has to reach for an MCP client just to save a
 * segment definition themselves.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseCreateSegmentRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const segment = await createSegment({
      organizationId: orgId,
      projectId,
      name: parsed.name,
      schemaName: parsed.schemaName,
      filters: parsed.filters,
      createdByUserId: user.id,
    });
    return NextResponse.json({ segment: toSegmentSummaryView(segment) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSegmentError) {
      return NextResponse.json({ error: 'invalid_segment', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
