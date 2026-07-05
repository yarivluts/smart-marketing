import { NextResponse, type NextRequest } from 'next/server';
import {
  InvalidScopeSelectionError,
  isResourceKind,
  ProjectNotFoundError,
  ResourceNotFoundError,
} from '@growthos/firebase-orm-models';
import { requestResourceAttachment } from '@/lib/orgs/mutations';
import { listAttachmentsForProject } from '@/lib/orgs/queries';
import { requireOrgMembership, requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every resource-library attachment (any status) for one project — any active member. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgMembership(orgId);
  if (error) {
    return error;
  }

  const attachments = await listAttachmentsForProject(orgId, projectId);
  return NextResponse.json({
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      resourceKind: attachment.resource_kind,
      resourceId: attachment.resource_id,
      status: attachment.status,
      scopeSelection: attachment.scope_selection ?? [],
    })),
  });
}

/**
 * A project admin's request to attach an org library resource — plan 08
 * §1.2 "project-admin initiated". Requires `project.manage`, the same
 * permission that gates creating a project in the first place.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ resourceKind?: unknown; resourceId?: unknown; scopeSelection?: unknown }>(
    request,
  );
  if (parsed.error) {
    return parsed.error;
  }
  const { resourceKind, resourceId, scopeSelection } = parsed.body;
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
    const attachment = await requestResourceAttachment({
      organizationId: orgId,
      projectId,
      resourceKind,
      resourceId,
      requestedByUserId: user.id,
      scopeSelection,
    });
    return NextResponse.json({ attachmentId: attachment.id }, { status: 201 });
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
