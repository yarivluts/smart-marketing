import { NextResponse } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { replayFailedPipelineMessagesForProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Retries every currently-failed pipeline message for a project (KAN-34's DLQ replay) — gated on
 * `ingest.write`, same as the ingest-health page this action lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const result = await replayFailedPipelineMessagesForProject({
      organizationId: orgId,
      projectId,
      performedByUserId: user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
