import { NextResponse, type NextRequest } from 'next/server';
import { MetricDefNotFoundError, MetricDefStillReferencedError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { archiveMetricDefinition } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toMetricDefView } from '@/lib/orgs/metric-def-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Retires a metric family (see `archiveMetricDefinition`'s own doc comment) —
 * the admin action behind the metric catalog's "Archive" button. Same
 * `metrics.write` gate as register/evolve; 409 when an active formula still
 * references the family, so the caller learns what to evolve first.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'metrics.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  try {
    const metricDef = await archiveMetricDefinition({ organizationId: orgId, projectId, name, archivedByUserId: user.id });
    return NextResponse.json({ metricDef: toMetricDefView(metricDef) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof MetricDefNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof MetricDefStillReferencedError) {
      return NextResponse.json({ error: 'still_referenced', referencedBy: err.referencedBy }, { status: 409 });
    }
    throw err;
  }
}
