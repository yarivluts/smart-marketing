import { NextResponse } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { checkTrackingAlertsForProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Manually checks every active event schema's volume for a project right
 * now (KAN-36's buildable-today stand-in for a real hourly scheduled check
 * — see `@growthos/firebase-orm-models`'s `tracking-alert.service.ts` for
 * why a real scheduler is deferred to KAN-18). Gated on `schema.write`, same
 * as every other action on the schema registry page this button lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'schema.write');
  if (error) {
    return error;
  }

  try {
    const result = await checkTrackingAlertsForProject({ organizationId: orgId, projectId, triggeredByUserId: user.id });
    return NextResponse.json({ checkedAt: result.checkedAt, outcomes: result.outcomes.map((outcome) => ({ schemaName: outcome.schemaName, action: outcome.action })) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
