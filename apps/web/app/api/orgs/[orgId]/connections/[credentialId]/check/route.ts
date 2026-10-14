import { NextResponse, type NextRequest } from 'next/server';
import { checkAdPlatformConnection, NotAnAdPlatformCredentialError } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';
import { toConnectionView } from '@/lib/integrations/connections';

interface RouteParams {
  params: Promise<{ orgId: string; credentialId: string }>;
}

/** Re-checks a saved ad platform connection against its platform and keeps the outcome. Needs `resources.manage`. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, credentialId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) return error;
  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (err instanceof VaultNotConfiguredError) return NextResponse.json({ error: 'vault_not_configured' }, { status: 500 });
    throw err;
  }
  await ensureFirestoreOrm();
  try {
    const { credential, check } = await checkAdPlatformConnection({ organizationId: orgId, credentialId, actorId: user.id, kms });
    return NextResponse.json({ check, connection: toConnectionView(credential) });
  } catch (err) {
    if (err instanceof NotAnAdPlatformCredentialError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    throw err;
  }
}
