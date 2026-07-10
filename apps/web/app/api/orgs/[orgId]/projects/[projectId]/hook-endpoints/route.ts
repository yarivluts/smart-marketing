import { NextResponse, type NextRequest } from 'next/server';
import { EnvironmentNotFoundError, HOOK_SIGNATURE_MODES, MissingSignatureHeaderNameError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { createHookEndpoint } from '@/lib/orgs/mutations';
import { listHookEndpointsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every hook endpoint (active or disabled) for one project — gated on `ingest.write`, the same permission KAN-35's ingest-health page already reuses for inbound-data admin surfaces. */
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
  return NextResponse.json({
    hookEndpoints: hookEndpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      environmentId: endpoint.environment_id,
      hookId: endpoint.hook_id,
      signatureMode: endpoint.signature_mode,
      signatureHeaderName: endpoint.signature_header_name,
      hasSigningSecret: Boolean(endpoint.signing_secret_encrypted),
      disabledAt: endpoint.disabled_at,
    })),
  });
}

/** Creates a new per-project+environment inbound webhook receiver (KAN-53). An `hmac_sha256`-mode endpoint is created without a secret — see the `.../secret` route to set one. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{
    name?: unknown;
    environmentId?: unknown;
    signatureMode?: unknown;
    signatureHeaderName?: unknown;
  }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, environmentId, signatureMode, signatureHeaderName } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }
  if (typeof signatureMode !== 'string' || !(HOOK_SIGNATURE_MODES as readonly string[]).includes(signatureMode)) {
    return NextResponse.json({ error: 'invalid_signature_mode' }, { status: 400 });
  }

  try {
    const endpoint = await createHookEndpoint({
      organizationId: orgId,
      projectId,
      environmentId,
      name: name.trim(),
      signatureMode: signatureMode as (typeof HOOK_SIGNATURE_MODES)[number],
      signatureHeaderName: typeof signatureHeaderName === 'string' ? signatureHeaderName : undefined,
      createdByUserId: user.id,
    });
    return NextResponse.json({ hookEndpointId: endpoint.id, hookId: endpoint.hook_id }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof MissingSignatureHeaderNameError) {
      return NextResponse.json({ error: 'signature_header_name_required' }, { status: 400 });
    }
    throw err;
  }
}
