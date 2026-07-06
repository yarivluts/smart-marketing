import { NextResponse, type NextRequest } from 'next/server';
import { CredentialSecretNotSetError, SharedCredentialNotFoundError } from '@growthos/firebase-orm-models';
import { rotateSharedCredentialSecretKey } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; credentialId: string }>;
}

/**
 * Re-wraps a shared credential's stored secret under the vault's current
 * KMS key (KAN-29) — requires `resources.manage`, same gate as setting the
 * secret. A no-op (still `200`) if the secret is already wrapped by the
 * current key.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, credentialId } = await params;
  const { error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
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
    await rotateSharedCredentialSecretKey({ organizationId: orgId, credentialId, kms });
    return NextResponse.json({ status: 'rotated' });
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
