import { NextResponse, type NextRequest } from 'next/server';
import { startMetaOAuth } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { metaOAuthConfig, publicWebOrigin, safeLocale } from '@/lib/integrations/meta';

/**
 * Starts "Connect with Facebook": records a single-use session for this person and sends them to
 * Meta's consent dialog. Creating and attaching an org credential is `resources.manage`, so starting
 * is too. Without a configured Meta app it lands on the connect page, which explains what is missing.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams;
  const orgId = query.get('orgId') ?? '';
  const locale = safeLocale(query.get('locale'));
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) return error;
  const origin = publicWebOrigin(request.url);
  const config = metaOAuthConfig(request.url);
  if (!config) return NextResponse.redirect(`${origin}/${locale}/orgs/${orgId}/integrations/meta?error=not_configured`, 302);
  await ensureFirestoreOrm();
  const { authorizeUrl } = await startMetaOAuth({
    organizationId: orgId,
    projectId: query.get('projectId') || null,
    userId: user.id,
    locale,
    returnTo: query.get('returnTo'),
    config,
  });
  return NextResponse.redirect(authorizeUrl, 302);
}
