import { NextResponse, type NextRequest } from 'next/server';
import { completeMetaOAuth, MetaOAuthError, peekMetaOAuthSession } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { metaOAuthConfig, publicWebOrigin } from '@/lib/integrations/meta';

/**
 * Meta sends the person back here with `code` and `state` (or an error: declined, or Meta's own refusal). The code
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
  if (!query.get('code')) {
    // A person who cancels comes back with error_reason=user_denied; anything else is Meta refusing the
    // request (e.g. an app domain or redirect URI not registered), and its own message says why.
    const detail = (query.get('error_message') ?? query.get('error_description') ?? '').trim().slice(0, 300);
    const declined = query.get('error_reason') === 'user_denied' || !detail;
    return NextResponse.redirect(declined ? `${page}?error=declined` : `${page}?error=meta_error&detail=${encodeURIComponent(detail)}`, 302);
  }
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
