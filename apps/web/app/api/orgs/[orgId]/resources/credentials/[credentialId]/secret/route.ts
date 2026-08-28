import { NextResponse, type NextRequest } from 'next/server';
import { CredentialSecretNotSetError, SharedCredentialNotFoundError } from '@growthos/firebase-orm-models';
import { clearSharedCredentialSecret, setSharedCredentialSecret } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; credentialId: string }>;
}

/**
 * Sets (or replaces) a shared credential's secret (KAN-29) — requires
 * `resources.manage`, same gate as creating the credential itself. Write-only
 * by design: this route never returns the secret, and there is no
 * corresponding GET — once set, a secret is only ever read back
 * server-to-server by a connector (KAN-49/50/51), never by a browser.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, credentialId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ secret?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { secret } = parsed.body;
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    return NextResponse.json({ error: 'secret_required' }, { status: 400 });
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
    await setSharedCredentialSecret({ organizationId: orgId, credentialId, secret: secret.trim(), kms, actorId: user.id });
    return NextResponse.json({ status: 'set' });
  } catch (err) {
    if (err instanceof SharedCredentialNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/**
 * Clears a shared credential's stored secret without deleting the credential itself (KAN-29
 * follow-up) — requires `resources.manage`, same gate as setting the secret. Unlike `PUT`, no
 * KMS provider is needed: clearing never touches the ciphertext. `409 secret_not_set` when
 * there's nothing to clear, matching this codebase's established 409-for-invalid-state
 * convention (see the sibling `rotate` route).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, credentialId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  try {
    await clearSharedCredentialSecret({ organizationId: orgId, credentialId, actorId: user.id });
    return NextResponse.json({ status: 'cleared' });
  } catch (err) {
    if (err instanceof SharedCredentialNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof CredentialSecretNotSetError) {
      return NextResponse.json({ error: 'secret_not_set' }, { status: 409 });
    }
    throw err;
  }
}
