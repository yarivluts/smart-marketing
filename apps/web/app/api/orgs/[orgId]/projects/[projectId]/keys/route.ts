import { NextResponse, type NextRequest } from 'next/server';
import {
  EnvironmentNotFoundError,
  InvalidApiKeyScopeError,
  isApiKeyScope,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { mintApiKey } from '@/lib/orgs/mutations';
import { listApiKeysForProject, listOrgProjects } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Lists every key (active or revoked) minted for one project — an
 * admin-only surface, gated on `keys.manage`. Validates `projectId` belongs
 * to the org first (404 otherwise), matching this same route's POST and the
 * `[apiKeyId]` DELETE route, both of which 404 on an unknown project via
 * `mintApiKey`/`revokeApiKey`'s own checks — without this, a caller could
 * pass a project id from a different org and get an empty `200` instead of
 * the `404` every other verb on this resource returns for the same input.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'keys.manage');
  if (error) {
    return error;
  }

  const projects = await listOrgProjects(orgId);
  if (!projects.some((project) => project.id === projectId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const apiKeys = await listApiKeysForProject(orgId, projectId);
  return NextResponse.json({ apiKeys });
}

/**
 * Mints a new key scoped to one project + environment (KAN-30). Returns the
 * raw key exactly once in this response body — it is never retrievable
 * again once the client discards it (the "copy-once" pattern).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'keys.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; environmentId?: unknown; scopes?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, environmentId, scopes } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }
  if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((scope) => typeof scope === 'string' && isApiKeyScope(scope))) {
    return NextResponse.json({ error: 'invalid_scopes' }, { status: 400 });
  }

  try {
    const { apiKey, rawKey } = await mintApiKey({
      organizationId: orgId,
      projectId,
      environmentId,
      name: name.trim(),
      scopes,
      createdByUserId: user.id,
    });
    return NextResponse.json({ apiKeyId: apiKey.id, keyPrefix: apiKey.key_prefix, rawKey }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidApiKeyScopeError) {
      return NextResponse.json({ error: 'invalid_scopes' }, { status: 400 });
    }
    throw err;
  }
}
