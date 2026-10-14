import { NextResponse, type NextRequest } from 'next/server';
import { AdPlatformDetailsInvalidError, connectAdPlatform, isAdPlatformProvider, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';
import { toConnectionView } from '@/lib/integrations/connections';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Connects an ad platform (`google_ads`, `meta_ads`, `tiktok_ads`) from the details a person typed:
 * checks them against the platform and saves only a connection that works, attached to `projectId`
 * when given. 200 `{check, connection}` either way (connection is null when the check failed);
 * 400 `invalid_details` with the fields to fix. Needs `resources.manage`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) return error;
  const parsed = await parseJsonBody<{ provider?: unknown; fields?: unknown; projectId?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const { provider, fields, projectId } = parsed.body ?? {};
  if (!isAdPlatformProvider(provider) || !fields || typeof fields !== 'object') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (err instanceof VaultNotConfiguredError) return NextResponse.json({ error: 'vault_not_configured' }, { status: 500 });
    throw err;
  }
  await ensureFirestoreOrm();
  try {
    const result = await connectAdPlatform({
      organizationId: orgId,
      provider,
      fields: fields as Record<string, unknown>,
      projectId: typeof projectId === 'string' && projectId ? projectId : null,
      actorId: user.id,
      kms,
    });
    return NextResponse.json({ check: result.check, created: result.created, connection: result.credential ? toConnectionView(result.credential) : null });
  } catch (err) {
    if (err instanceof AdPlatformDetailsInvalidError) return NextResponse.json({ error: 'invalid_details', fields: err.fields }, { status: 400 });
    if (err instanceof ProjectNotFoundError) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    throw err;
  }
}
