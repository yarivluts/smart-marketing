import { NextResponse, type NextRequest } from 'next/server';
import { ApiKeyNotFoundError, InvalidApiKeyNameError } from '@growthos/firebase-orm-models';
import { renameApiKey, revokeApiKey } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; apiKeyId: string }>;
}

/** Revokes a key immediately (KAN-30/KAN-28 AC) — gated on `keys.manage`, same as minting. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, apiKeyId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'keys.manage');
  if (error) {
    return error;
  }

  try {
    await revokeApiKey({ organizationId: orgId, projectId, apiKeyId, revokedByUserId: user.id });
    return NextResponse.json({ status: 'revoked' });
  } catch (err) {
    if (err instanceof ApiKeyNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/**
 * Corrects a key's own display `name` (KAN-126, same "create + list only,
 * no way to fix a typo'd definition" gap KAN-100/117/119/120/121/123/124
 * already closed for their own sibling registries) — gated on `keys.manage`,
 * same as minting/revoking. `scopes`/`environmentId` stay immutable, per
 * `renameApiKey`'s own doc comment.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, apiKeyId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'keys.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  try {
    const apiKey = await renameApiKey({ organizationId: orgId, projectId, apiKeyId, name, actorUserId: user.id });
    return NextResponse.json({ apiKeyId: apiKey.id, name: apiKey.name });
  } catch (err) {
    if (err instanceof ApiKeyNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidApiKeyNameError) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    throw err;
  }
}
