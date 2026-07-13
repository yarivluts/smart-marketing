import { NextResponse, type NextRequest } from 'next/server';
import {
  AttachmentNotApprovedError,
  AttachmentNotCredentialError,
  AttachmentNotFoundError,
  InvalidWriteTierError,
  isConnectionWriteTier,
} from '@growthos/firebase-orm-models';
import { setResourceAttachmentWriteTier } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; attachmentId: string }>;
}

/** The org-resource-owner's write-tier selector for a connection (KAN-74) — requires `resources.manage`, same gate as detach. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, attachmentId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ tier?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  if (typeof parsed.body.tier !== 'string' || !isConnectionWriteTier(parsed.body.tier)) {
    return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
  }

  try {
    const attachment = await setResourceAttachmentWriteTier({
      organizationId: orgId,
      attachmentId,
      tier: parsed.body.tier,
      actorId: user.id,
    });
    return NextResponse.json({ id: attachment.id, writeTier: attachment.write_tier });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AttachmentNotCredentialError) {
      return NextResponse.json({ error: 'not_a_credential' }, { status: 400 });
    }
    if (err instanceof AttachmentNotApprovedError) {
      return NextResponse.json({ error: 'not_approved' }, { status: 409 });
    }
    if (err instanceof InvalidWriteTierError) {
      return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
    }
    throw err;
  }
}
