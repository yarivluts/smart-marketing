import { NextResponse } from 'next/server';
import { sweepQueuedPipelineMessagesForProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Lands every pipeline message still stuck `queued` for a project (e.g. a crash between publish and
 * land) — gated on `ingest.write`, same as the ingest-health page this action lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const result = await sweepQueuedPipelineMessagesForProject({
    organizationId: orgId,
    projectId,
    performedByUserId: user.id,
  });
  return NextResponse.json(result);
}
