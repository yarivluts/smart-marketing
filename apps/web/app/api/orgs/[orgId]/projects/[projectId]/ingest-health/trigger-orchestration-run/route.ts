import { NextResponse } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { triggerOrchestrationRun } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Manually triggers one orchestration run for a project right now (KAN-38's
 * buildable-today stand-in for "scheduled runs per project" — see
 * `@growthos/firebase-orm-models`'s `orchestration/executor.ts` for why a
 * real scheduler is deferred to KAN-18). Gated on `ingest.write`, same as
 * every other action on the ingest-health page this button lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const run = await triggerOrchestrationRun({ organizationId: orgId, projectId, triggeredByUserId: user.id });
    return NextResponse.json({ id: run.id, status: run.status, errorMessage: run.error_message ?? null });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
