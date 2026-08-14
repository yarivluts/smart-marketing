import { NextResponse, type NextRequest } from 'next/server';
import { PluginAlreadyInstalledError, ProjectNotFoundError, UnknownBuiltinMetricPackError } from '@growthos/firebase-orm-models';
import { installBuiltinMetricPack } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toPluginInstallView } from '@/lib/orgs/plugin-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * One-click install for a built-in metric pack (SaaS, Engagement, Landing
 * Page — see `listBuiltinMetricPacks`): unlike the generic
 * `POST .../plugins` route, the caller names only a `pluginId`, never a
 * manifest version, consented scopes, or config. `installBuiltinMetricPack`
 * registers the pack's manifest into the org's registry first if no version
 * of it exists yet, so a human never sees or pastes its `plugin.yaml` text —
 * the same path the onboarding wizard's "pick a pack" step already uses.
 * Gated on `plugin.install`, same as every other plugin route.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ pluginId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { pluginId } = parsed.body;
  if (typeof pluginId !== 'string' || pluginId.trim().length === 0) {
    return NextResponse.json({ error: 'plugin_id_required' }, { status: 400 });
  }

  try {
    const install = await installBuiltinMetricPack({ organizationId: orgId, projectId, pluginId, installedByUserId: user.id });
    return NextResponse.json({ install: toPluginInstallView(install) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof UnknownBuiltinMetricPackError) {
      return NextResponse.json({ error: 'unknown_plugin_id' }, { status: 400 });
    }
    if (err instanceof PluginAlreadyInstalledError) {
      return NextResponse.json({ error: 'already_installed' }, { status: 409 });
    }
    throw err;
  }
}
