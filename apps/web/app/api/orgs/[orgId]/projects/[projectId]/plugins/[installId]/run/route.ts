import { NextResponse, type NextRequest } from 'next/server';
import {
  EnvironmentNotFoundError,
  NotASourcePluginError,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  PluginManifestNotFoundError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { triggerSourcePluginRun } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toSourcePluginRunView } from '@/lib/orgs/plugin-view';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; installId: string }>;
}

/**
 * Manually triggers one incremental sync run for a source-plugin install
 * "right now" (KAN-47's buildable-today stand-in for "scheduled execution"
 * — see `@growthos/firebase-orm-models`'s `plugin-runtime.service.ts` for
 * why a real Cloud Run job scheduler is deferred to KAN-18). Gated on
 * `plugin.install`, the same permission every other action on this install
 * already requires.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, installId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
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

  try {
    const run = await triggerSourcePluginRun({
      organizationId: orgId,
      projectId,
      environmentId,
      installId,
      triggeredByUserId: user.id,
    });
    return NextResponse.json({ run: toSourcePluginRunView(run) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError || err instanceof PluginInstallNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof PluginInstallNotActiveError) {
      return NextResponse.json({ error: 'install_not_active' }, { status: 409 });
    }
    if (err instanceof NotASourcePluginError || err instanceof PluginManifestNotFoundError) {
      return NextResponse.json({ error: 'not_a_source_plugin' }, { status: 400 });
    }
    throw err;
  }
}
