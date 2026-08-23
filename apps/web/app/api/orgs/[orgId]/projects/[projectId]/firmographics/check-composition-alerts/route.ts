import { NextResponse } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { checkFirmographicCompositionAlertsForProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Manually checks every industry's customer-base composition-shift status
 * for a project right now (KAN-87's buildable-today stand-in for a real
 * scheduled check — see `@growthos/firebase-orm-models`'s
 * `firmographic.service.ts` for why a real scheduler is deferred to
 * KAN-18). Gated on `ingest.write`, same as every other action on the
 * Firmographics page this button lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const result = await checkFirmographicCompositionAlertsForProject({ organizationId: orgId, projectId, triggeredByUserId: user.id });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason });
    }
    return NextResponse.json({ ok: true, checkedAt: result.checkedAt, industries: result.industries.map((outcome) => ({ industry: outcome.industry, action: outcome.action })) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
