import { NextResponse, type NextRequest } from 'next/server';
import { drainPendingPipelineMessagesForEnvironment } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Manually drains one environment's still-`queued` pipeline messages right
 * now (KAN-33's `drainPendingPipelineMessages` — a catch-up sweep for
 * records published to the pipeline but never landed, e.g. after a worker
 * crash between publish and land — normally nothing is ever left `queued`,
 * since `ingestBatch` itself always lands what it just published). Gated on
 * `ingest.write`, same as every other action on the ingest-health page this
 * button lives on.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ environmentId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { environmentId } = parsed.body;
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }

  const result = await drainPendingPipelineMessagesForEnvironment({
    organizationId: orgId,
    projectId,
    environmentId,
    performedByUserId: user.id,
  });
  return NextResponse.json(result);
}
