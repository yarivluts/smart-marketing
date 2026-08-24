import { NextResponse } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { checkQualityMixAlertsForProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Manually checks every marketing channel's signup-quality mix for a
 * project right now (KAN-83's buildable-today stand-in for a real scheduled
 * check — see `checkQualityMixAlertsForProject`'s own doc comment in
 * `@growthos/firebase-orm-models`). Gated on `ingest.write`, same as every
 * other action on the Intent & Quality page this button lives on.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    const result = await checkQualityMixAlertsForProject({ organizationId: orgId, projectId, triggeredByUserId: user.id });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason });
    }
    return NextResponse.json({ ok: true, checkedAt: result.checkedAt, channels: result.channels.map((outcome) => ({ channelId: outcome.channelId, action: outcome.action })) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
