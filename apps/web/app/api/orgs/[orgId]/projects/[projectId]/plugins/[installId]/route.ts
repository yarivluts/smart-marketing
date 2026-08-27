import { NextResponse, type NextRequest } from 'next/server';
import { InvalidPluginConfigError, InvalidPluginInstallStateError, PluginInstallNotFoundError, PluginManifestNotFoundError } from '@growthos/firebase-orm-models';
import { updatePluginInstallConfig } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toPluginInstallView } from '@/lib/orgs/plugin-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; installId: string }>;
}

/**
 * Edits an already-installed plugin's own `config` values (KAN-124 — the
 * same "create + list only, no way to fix a typo'd definition" gap
 * KAN-100/KAN-109/KAN-117/KAN-119/KAN-120/KAN-121/KAN-123 already closed for
 * their own sibling registries). Gated on `plugin.install`, same as every
 * other mutation on this surface.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, installId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ config?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { config } = parsed.body;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return NextResponse.json({ error: 'invalid_config' }, { status: 400 });
  }

  try {
    const install = await updatePluginInstallConfig({
      organizationId: orgId,
      projectId,
      installId,
      config: config as Record<string, unknown>,
      performedByUserId: user.id,
    });
    return NextResponse.json({ install: toPluginInstallView(install) });
  } catch (err) {
    if (err instanceof PluginInstallNotFoundError || err instanceof PluginManifestNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidPluginConfigError) {
      return NextResponse.json({ error: 'invalid_config', reasons: err.reasons }, { status: 400 });
    }
    if (err instanceof InvalidPluginInstallStateError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    throw err;
  }
}
