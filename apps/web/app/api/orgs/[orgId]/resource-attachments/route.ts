import { NextResponse, type NextRequest } from 'next/server';
import {
  InvalidScopeSelectionError,
  isResourceKind,
  ProjectNotFoundError,
  ResourceNotFoundError,
} from '@growthos/firebase-orm-models';
import { pushResourceAttachment } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * An org-resource-owner pushing a library resource straight to one of the
 * org's projects — plan 08 §1.2's "project-admin initiated ... approved (or
 * **org-admin pushed**)", the half the project-scoped request route's own
 * doc comment named as not yet built. Requires `resources.manage` (the same
 * permission that already decides a pending request), so a push never grants
 * more than an org-resource-owner could already approve by hand — it just
 * skips the round trip.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{
    projectId?: unknown;
    resourceKind?: unknown;
    resourceId?: unknown;
    scopeSelection?: unknown;
  }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { projectId, resourceKind, resourceId, scopeSelection } = parsed.body;
  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    return NextResponse.json({ error: 'project_id_required' }, { status: 400 });
  }
  if (typeof resourceKind !== 'string' || !isResourceKind(resourceKind)) {
    return NextResponse.json({ error: 'invalid_resource_kind' }, { status: 400 });
  }
  if (typeof resourceId !== 'string' || resourceId.trim().length === 0) {
    return NextResponse.json({ error: 'resource_id_required' }, { status: 400 });
  }
  if (scopeSelection !== undefined && (!Array.isArray(scopeSelection) || !scopeSelection.every((s) => typeof s === 'string'))) {
    return NextResponse.json({ error: 'invalid_scope_selection' }, { status: 400 });
  }

  try {
    const attachment = await pushResourceAttachment({
      organizationId: orgId,
      projectId,
      resourceKind,
      resourceId,
      pushedByUserId: user.id,
      scopeSelection,
    });
    return NextResponse.json({ attachmentId: attachment.id, status: attachment.status }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidScopeSelectionError) {
      return NextResponse.json({ error: 'invalid_scope_selection' }, { status: 400 });
    }
    throw err;
  }
}
