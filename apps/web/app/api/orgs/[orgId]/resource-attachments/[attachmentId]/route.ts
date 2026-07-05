import { NextResponse, type NextRequest } from 'next/server';
import {
  AttachmentNotApprovedError,
  AttachmentNotFoundError,
  AttachmentNotPendingError,
} from '@growthos/firebase-orm-models';
import { decideResourceAttachment, detachResource } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; attachmentId: string }>;
}

/** The org-resource-owner decision on a pending attachment request — requires `resources.manage`. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, attachmentId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ approve?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  if (typeof parsed.body.approve !== 'boolean') {
    return NextResponse.json({ error: 'approve_required' }, { status: 400 });
  }

  try {
    const attachment = await decideResourceAttachment({
      organizationId: orgId,
      attachmentId,
      decidedByUserId: user.id,
      approve: parsed.body.approve,
    });
    return NextResponse.json({ status: attachment.status });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AttachmentNotPendingError) {
      return NextResponse.json({ error: 'already_decided' }, { status: 409 });
    }
    throw err;
  }
}

/** Revokes an approved attachment immediately — requires `resources.manage`. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, attachmentId } = await params;
  const { error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  try {
    await detachResource({ organizationId: orgId, attachmentId });
    return NextResponse.json({ status: 'detached' });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AttachmentNotApprovedError) {
      return NextResponse.json({ error: 'not_approved' }, { status: 409 });
    }
    throw err;
  }
}
