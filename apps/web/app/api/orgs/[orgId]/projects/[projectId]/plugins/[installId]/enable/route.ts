import { NextResponse } from 'next/server';
import { InvalidPluginInstallStateError, PluginInstallNotFoundError } from '@growthos/firebase-orm-models';
import { enablePlugin } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toPluginInstallView } from '@/lib/orgs/plugin-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; installId: string }>;
}

/** Resumes a disabled install (KAN-46 AC: "enable"/disable lifecycle) — gated on `plugin.install`, same as installing. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, installId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  try {
    const install = await enablePlugin({ organizationId: orgId, projectId, installId, performedByUserId: user.id });
    return NextResponse.json({ install: toPluginInstallView(install) });
  } catch (err) {
    if (err instanceof PluginInstallNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidPluginInstallStateError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    throw err;
  }
}
