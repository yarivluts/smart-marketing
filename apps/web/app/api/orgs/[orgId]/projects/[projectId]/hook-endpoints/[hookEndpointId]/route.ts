import { NextResponse, type NextRequest } from 'next/server';
import { HookEndpointNotFoundError, MissingSignatureHeaderNameError } from '@growthos/firebase-orm-models';
import { disableHookEndpoint, updateHookEndpoint } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }>;
}

/** Disables a hook endpoint's receive URL immediately (KAN-53) — gated on `ingest.write`, same as creating one. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookEndpointId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await disableHookEndpoint({ organizationId: orgId, projectId, hookEndpointId, disabledByUserId: user.id });
    return NextResponse.json({ status: 'disabled' });
  } catch (err) {
    if (err instanceof HookEndpointNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

interface UpdateHookEndpointRequestBody {
  name?: unknown;
  signatureHeaderName?: unknown;
}

/**
 * Edits an existing hook endpoint's own definition — name and (in
 * `hmac_sha256` mode) signatureHeaderName — always a full replace (KAN-123,
 * the same "create + list only, no way to fix a typo'd name" gap KAN-100/
 * KAN-117/KAN-119/KAN-120/KAN-121 already closed for their own sibling
 * registries). `signatureMode`/`environmentId`/`hookId` stay immutable —
 * see `updateHookEndpoint`'s own doc comment. Gated on `ingest.write`, same
 * as every other mutation on this route.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookEndpointId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const body = (await request.json().catch(() => null)) as UpdateHookEndpointRequestBody | null;
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body.signatureHeaderName !== undefined && typeof body.signatureHeaderName !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const endpoint = await updateHookEndpoint({
      organizationId: orgId,
      projectId,
      hookEndpointId,
      name: body.name,
      signatureHeaderName: body.signatureHeaderName,
      actorUserId: user.id,
    });
    return NextResponse.json({
      hookEndpoint: { id: endpoint.id, name: endpoint.name, signatureHeaderName: endpoint.signature_header_name },
    });
  } catch (err) {
    if (err instanceof HookEndpointNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof MissingSignatureHeaderNameError) {
      return NextResponse.json({ error: 'missing_signature_header_name' }, { status: 400 });
    }
    throw err;
  }
}
