import { NextResponse, type NextRequest } from 'next/server';
import { DuplicatePluginManifestError, PluginManifestValidationError } from '@growthos/firebase-orm-models';
import { listPluginManifestsForOrg } from '@/lib/orgs/queries';
import { registerPluginManifest } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toPluginManifestView } from '@/lib/orgs/plugin-view';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Lists an org's registered plugin manifest versions (KAN-46 AC: "registry
 * storage") — gated on `plugin.install`, the only permission the catalog
 * (plan `08 §5.3`) defines for this whole surface.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const manifests = await listPluginManifestsForOrg(orgId);
  return NextResponse.json({ manifests: manifests.map(toPluginManifestView) });
}

/** Parses + registers one `plugin.yaml` document (KAN-46 AC: "manifest parser"). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ manifestYaml?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { manifestYaml } = parsed.body;
  if (typeof manifestYaml !== 'string' || manifestYaml.trim().length === 0) {
    return NextResponse.json({ error: 'manifest_yaml_required' }, { status: 400 });
  }

  try {
    const manifest = await registerPluginManifest({ organizationId: orgId, manifestYaml, registeredByUserId: user.id });
    return NextResponse.json({ manifest: toPluginManifestView(manifest) }, { status: 201 });
  } catch (err) {
    if (err instanceof PluginManifestValidationError) {
      return NextResponse.json({ error: 'invalid_manifest', reasons: err.reasons }, { status: 400 });
    }
    if (err instanceof DuplicatePluginManifestError) {
      return NextResponse.json({ error: 'duplicate_manifest' }, { status: 409 });
    }
    throw err;
  }
}
