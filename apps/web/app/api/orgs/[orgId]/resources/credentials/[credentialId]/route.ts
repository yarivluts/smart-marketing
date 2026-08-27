import { NextResponse, type NextRequest } from 'next/server';
import { ResourceNotFoundError } from '@growthos/firebase-orm-models';
import { updateSharedCredential } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; credentialId: string }>;
}

/**
 * Edits an existing shared credential's name/available-scope slice (KAN-119
 * — `createSharedCredential`/`listSharedCredentials` had create + list only,
 * the same gap KAN-100/KAN-117 already closed for the people registry and
 * templates; see `updateSharedCredential`'s own doc comment). Same
 * `resources.manage` gate as creating one. `provider` is not editable here —
 * changing what a credential authenticates against is a different
 * credential, not a correction, the same posture `PATCH .../templates/
 * [templateId]` already takes for `type`. Unlike that route's optional
 * `config`, `availableScopes` here is always required: it's a full replace
 * of the credential's whole scope slice, and `available_scopes` is itself
 * always an array (possibly empty) rather than an absent field, so there is
 * no "omit to clear" case to support.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, credentialId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; availableScopes?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, availableScopes } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (!Array.isArray(availableScopes) || !availableScopes.every((scope) => typeof scope === 'string')) {
    return NextResponse.json({ error: 'invalid_available_scopes' }, { status: 400 });
  }

  try {
    const credential = await updateSharedCredential({
      organizationId: orgId,
      credentialId,
      name: name.trim(),
      availableScopes,
      actorId: user.id,
    });
    return NextResponse.json({
      credential: {
        id: credential.id,
        name: credential.name,
        provider: credential.provider,
        availableScopes: credential.available_scopes ?? [],
      },
    });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
