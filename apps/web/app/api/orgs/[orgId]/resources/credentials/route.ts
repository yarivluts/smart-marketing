import { NextResponse, type NextRequest } from 'next/server';
import { isCredentialProvider } from '@growthos/firebase-orm-models';
import { createSharedCredential } from '@/lib/orgs/mutations';
import { listSharedCredentials } from '@/lib/orgs/queries';
import { requireOrgMembership, requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** Lists the org's shared connection credentials — any active member (e.g. to pick one to request attaching). */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error } = await requireOrgMembership(orgId);
  if (error) {
    return error;
  }

  const credentials = await listSharedCredentials(orgId);
  return NextResponse.json({
    credentials: credentials.map((credential) => ({
      id: credential.id,
      name: credential.name,
      provider: credential.provider,
      availableScopes: credential.available_scopes ?? [],
      hasSecret: Boolean(credential.encrypted_secret),
    })),
  });
}

/** Registers a new org-level shared credential's identity — requires `resources.manage`. Its secret (if any) is set separately via the `[credentialId]/secret` route. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; provider?: unknown; availableScopes?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, provider, availableScopes } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (typeof provider !== 'string' || !isCredentialProvider(provider)) {
    return NextResponse.json({ error: 'invalid_provider' }, { status: 400 });
  }
  if (!Array.isArray(availableScopes) || !availableScopes.every((scope) => typeof scope === 'string')) {
    return NextResponse.json({ error: 'invalid_available_scopes' }, { status: 400 });
  }

  const credential = await createSharedCredential({
    organizationId: orgId,
    name: name.trim(),
    provider,
    availableScopes,
    createdByUserId: user.id,
  });
  return NextResponse.json({ credentialId: credential.id }, { status: 201 });
}
