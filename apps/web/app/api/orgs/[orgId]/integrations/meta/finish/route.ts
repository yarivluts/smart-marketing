import { NextResponse, type NextRequest } from 'next/server';
import { finishMetaOAuth, MetaOAuthError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * The person's pick: which ad account and Page to connect, and to which project. Writes (or, when
 * reconnecting, refreshes) the Meta Ads credential, attaches it with the `manage` tier and ends the
 * session. Audited as `meta.connected` / `meta.reconnected`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) return error;
  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const session = text(body.session);
  const adAccountId = text(body.adAccountId);
  const pageId = text(body.pageId);
  if (!session || !adAccountId || !pageId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const result = await finishMetaOAuth({
      organizationId: orgId,
      state: session,
      userId: user.id,
      adAccountId,
      pageId,
      ...(typeof body.projectId === 'string' ? { projectId: body.projectId || null } : {}),
      kms: getServerKmsProvider(),
    });
    return NextResponse.json({ credentialId: result.credential.id, attachmentId: result.attachment?.id ?? null, returnTo: result.returnTo, created: result.created });
  } catch (err) {
    if (err instanceof MetaOAuthError) return NextResponse.json({ error: err.code }, { status: err.code === 'invalid_choice' ? 400 : 409 });
    if (err instanceof ProjectNotFoundError) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    throw err;
  }
}
