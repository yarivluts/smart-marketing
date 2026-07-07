import { NextResponse, type NextRequest } from 'next/server';
import { InvalidMetricDefinitionError, MetricDefNotFoundError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { evolveMetricDefinition } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseMetricDefRequestBody } from '@/lib/orgs/parse-metric-def-fields';
import { toMetricDefView } from '@/lib/orgs/metric-def-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Registers the next version of an already-registered metric (plan `04 §7`:
 * "changing a definition is tracked, and historical dashboards can pin a
 * version"). The previous version is never mutated in place — see
 * `evolveMetricDefinition`'s own doc comment — so a 201 here means a brand
 * new version document now exists alongside the one it evolved from.
 */
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
    const metricDef = await evolveMetricDefinition({
      organizationId: orgId,
      projectId,
      name: parsed.name,
      definition: parsed.definition,
      dimensions: parsed.dimensions,
      createdByUserId: user.id,
    });
    return NextResponse.json({ metricDef: toMetricDefView(metricDef) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof MetricDefNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidMetricDefinitionError) {
      return NextResponse.json({ error: 'invalid_definition', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
