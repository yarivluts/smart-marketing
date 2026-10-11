import { NextResponse, type NextRequest } from 'next/server';
import { EnvironmentNotFoundError, InvalidBackfillEndpointError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { setProjectBackfillEndpoint } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Registers or updates one environment's backfill endpoint (the Backfill panel on Ingest health).
 * Gated on `project.configure`, like the MCP `set_backfill_endpoint` tool. The signing secret is
 * in the response only when it was issued - the panel shows it once.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) {
    return error;
  }
  const parsed = await parseJsonBody<{ environmentId?: unknown; url?: unknown; schemas?: unknown; rotateSecret?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { environmentId, url, schemas, rotateSecret } = parsed.body;
  if (typeof environmentId !== 'string' || typeof url !== 'string' || !Array.isArray(schemas)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  try {
    const result = await setProjectBackfillEndpoint({
      organizationId: orgId,
      projectId,
      environmentId,
      url,
      schemas: schemas.map((schema: { kind?: unknown; name?: unknown }) => ({ kind: String(schema?.kind ?? ''), name: String(schema?.name ?? '') })),
      rotateSecret: rotateSecret === true,
      actedByUserId: user.id,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidBackfillEndpointError) {
      return NextResponse.json({ error: 'invalid_endpoint', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
