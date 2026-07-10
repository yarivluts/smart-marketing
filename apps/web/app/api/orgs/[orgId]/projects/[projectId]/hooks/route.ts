import { NextResponse, type NextRequest } from 'next/server';
import { EnvironmentNotFoundError, isHookSignatureMode, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { mintHookEndpoint } from '@/lib/orgs/mutations';
import { listHookEndpointsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every hook endpoint (active or revoked) created for one project — gated on `ingest.write`, same posture `IngestHealthPage`'s quarantine browser uses for operationally sensitive ingest surfaces. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const projects = await listOrgProjects(orgId);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const hookEndpoints = await listHookEndpointsForProject(orgId, projectId);
  return NextResponse.json({ hookEndpoints });
}

/**
 * Creates a new per-project inbound webhook endpoint (KAN-53). Returns the raw signing secret
 * exactly once when `signatureMode` is `hmac_sha256` — the same "copy-once" pattern KAN-30's
 * key-mint route uses.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; environmentId?: unknown; signatureMode?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, environmentId, signatureMode } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }
  if (typeof signatureMode !== 'string' || !isHookSignatureMode(signatureMode)) {
    return NextResponse.json({ error: 'invalid_signature_mode' }, { status: 400 });
  }

  let kms;
  if (signatureMode === 'hmac_sha256') {
    try {
      kms = getServerKmsProvider();
    } catch (err) {
      if (err instanceof VaultNotConfiguredError) {
        return NextResponse.json({ error: 'vault_not_configured' }, { status: 500 });
      }
      throw err;
    }
  }

  try {
    const { hookEndpoint, rawSigningSecret } = await mintHookEndpoint({
      organizationId: orgId,
      projectId,
      environmentId,
      name: name.trim(),
      signatureMode,
      createdByUserId: user.id,
      kms,
    });
    return NextResponse.json(
      { hookEndpointId: hookEndpoint.id, signatureMode: hookEndpoint.signature_mode, rawSigningSecret },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
