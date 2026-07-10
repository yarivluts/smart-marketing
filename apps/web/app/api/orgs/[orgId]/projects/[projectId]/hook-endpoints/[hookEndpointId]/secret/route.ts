import { NextResponse, type NextRequest } from 'next/server';
import { HookEndpointNotFoundError, HookEndpointNotHmacModeError } from '@growthos/firebase-orm-models';
import { setHookEndpointSigningSecret } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }>;
}

/**
 * Sets (or rotates) an `hmac_sha256` hook endpoint's signing secret (KAN-53,
 * KAN-29 vault) — gated on `ingest.write`, same as creating the endpoint.
 * Write-only: never returns the secret, and there is no corresponding GET —
 * it's only ever read back server-to-server, at receive time, in `apps/api`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, hookEndpointId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ signingSecret?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { signingSecret } = parsed.body;
  if (typeof signingSecret !== 'string' || signingSecret.trim().length === 0) {
    return NextResponse.json({ error: 'signing_secret_required' }, { status: 400 });
  }

  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (err instanceof VaultNotConfiguredError) {
      return NextResponse.json({ error: 'vault_not_configured' }, { status: 500 });
    }
    throw err;
  }

  try {
    await setHookEndpointSigningSecret({
      organizationId: orgId,
      projectId,
      hookEndpointId,
      signingSecret: signingSecret.trim(),
      kms,
      actedByUserId: user.id,
    });
    return NextResponse.json({ status: 'set' });
  } catch (err) {
    if (err instanceof HookEndpointNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof HookEndpointNotHmacModeError) {
      return NextResponse.json({ error: 'not_hmac_mode' }, { status: 400 });
    }
    throw err;
  }
}
