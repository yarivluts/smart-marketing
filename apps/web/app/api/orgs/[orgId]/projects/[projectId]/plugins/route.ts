import { NextResponse, type NextRequest } from 'next/server';
import {
  InvalidPluginConfigError,
  PluginAlreadyInstalledError,
  PluginManifestNotFoundError,
  PluginScopeConsentMismatchError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { listPluginInstallsForProject } from '@/lib/orgs/queries';
import { installPlugin } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toPluginInstallView } from '@/lib/orgs/plugin-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists a project's plugin installs (any status) — gated on `plugin.install`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  try {
    const installs = await listPluginInstallsForProject(orgId, projectId);
    return NextResponse.json({ installs: installs.map(toPluginInstallView) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Installs a registered manifest version into this project (KAN-46 AC: "scope consent screen"). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{
    pluginId?: unknown;
    version?: unknown;
    consentedScopes?: unknown;
    config?: unknown;
  }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { pluginId, version, consentedScopes, config } = parsed.body;
  if (typeof pluginId !== 'string' || pluginId.trim().length === 0) {
    return NextResponse.json({ error: 'plugin_id_required' }, { status: 400 });
  }
  if (typeof version !== 'string' || version.trim().length === 0) {
    return NextResponse.json({ error: 'version_required' }, { status: 400 });
  }
  if (!Array.isArray(consentedScopes) || consentedScopes.some((scope) => typeof scope !== 'string')) {
    return NextResponse.json({ error: 'invalid_consented_scopes' }, { status: 400 });
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return NextResponse.json({ error: 'invalid_config' }, { status: 400 });
  }

  try {
    const install = await installPlugin({
      organizationId: orgId,
      projectId,
      pluginId,
      version,
      consentedScopes: consentedScopes as string[],
      config: config as Record<string, unknown>,
      installedByUserId: user.id,
    });
    return NextResponse.json({ install: toPluginInstallView(install) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof PluginManifestNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof PluginScopeConsentMismatchError) {
      return NextResponse.json({ error: 'scope_consent_mismatch', message: err.message }, { status: 400 });
    }
    if (err instanceof InvalidPluginConfigError) {
      return NextResponse.json({ error: 'invalid_config', reasons: err.reasons }, { status: 400 });
    }
    if (err instanceof PluginAlreadyInstalledError) {
      return NextResponse.json({ error: 'already_installed' }, { status: 409 });
    }
    throw err;
  }
}
