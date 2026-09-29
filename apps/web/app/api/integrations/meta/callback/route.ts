import { NextResponse, type NextRequest } from 'next/server';
import { completeMetaOAuth, MetaOAuthError, peekMetaOAuthSession } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { metaOAuthConfig, publicWebOrigin } from '@/lib/integrations/meta';

/**
 * Meta sends the person back here with `code` and `state` (or `error` when they declined). The code
 * is exchanged for a long-lived token, which stays sealed on the session, and the person moves on to
 * pick the ad account and Page. Every outcome lands on the connect page, with an error code if any.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams;
  const state = query.get('state') ?? '';
  const origin = publicWebOrigin(request.url);
  await ensureFirestoreOrm();
  const session = await peekMetaOAuthSession(state);
  if (!session) return NextResponse.redirect(`${origin}/en/orgs?metaError=session_not_found`, 302);
  const page = `${origin}/${session.locale}/orgs/${session.organizationId}/integrations/meta`;
  const { user, error } = await requireOrgPermission(session.organizationId, 'resources.manage');
  if (error) return error;
  if (query.get('error') || !query.get('code')) return NextResponse.redirect(`${page}?error=declined`, 302);
  const config = metaOAuthConfig(request.url);
  if (!config) return NextResponse.redirect(`${page}?error=not_configured`, 302);
  try {
    await completeMetaOAuth({ state, code: query.get('code') as string, userId: user.id, config, kms: getServerKmsProvider() });
  } catch (err) {
    if (err instanceof MetaOAuthError) return NextResponse.redirect(`${page}?error=${err.code}`, 302);
    throw err;
  }
  return NextResponse.redirect(`${page}?session=${encodeURIComponent(state)}`, 302);
}
