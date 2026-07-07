import { NextResponse, type NextRequest } from 'next/server';
import { DuplicateMetricDefinitionError, InvalidMetricDefinitionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { registerMetricDefinition } from '@/lib/orgs/mutations';
import { listMetricDefinitionsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseMetricDefRequestBody } from '@/lib/orgs/parse-metric-def-fields';
import { toMetricDefView } from '@/lib/orgs/metric-def-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Lists every version of every metric registered in a project (KAN-40) — an
 * admin surface gated on `metrics.write`. Validates `projectId` belongs to
 * the org first (404 otherwise), same convention KAN-31's schema-defs route
 * established: without this check a project id from a different org would
 * silently return an empty `200` instead of the `404` this route's own POST
 * returns for the same input.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'metrics.write');
  if (error) {
    return error;
  }

  const [projects, metricDefs] = await Promise.all([listOrgProjects(orgId), listMetricDefinitionsForProject(orgId, projectId)]);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ metricDefs: metricDefs.map(toMetricDefView) });
}

/** Registers v1 of a new metric (plan `04 §2`: "every metric is defined once as config"). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'metrics.write');
  if (error) {
    return error;
  }

  const parsed = await parseMetricDefRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const metricDef = await registerMetricDefinition({
      organizationId: orgId,
      projectId,
      name: parsed.name,
      definition: parsed.definition,
      dimensions: parsed.dimensions,
      createdByUserId: user.id,
    });
    return NextResponse.json({ metricDef: toMetricDefView(metricDef) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof DuplicateMetricDefinitionError) {
      return NextResponse.json({ error: 'duplicate_metric' }, { status: 409 });
    }
    if (err instanceof InvalidMetricDefinitionError) {
      return NextResponse.json({ error: 'invalid_definition', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
