import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { listSegmentsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toSegmentSummaryView } from '@/lib/orgs/segment-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Lists a project's saved segments (KAN-76), newest-first — gated on
 * `dashboards.write`, reusing the goals/boards features' permission. Read
 * only: segments are created via the MCP `create_segment` tool, not through
 * this app — this route is the human-facing view/audit surface for what an
 * agent has saved, not a parallel creation path.
 */
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
