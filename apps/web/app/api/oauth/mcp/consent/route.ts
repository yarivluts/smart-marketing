import { NextResponse } from 'next/server';
import { InsufficientMcpReadPermissionError, InvalidMcpOAuthClientError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { requireRegisteredMcpRedirectUri } from '@/lib/orgs/queries';
import { issueMcpAuthorizationCode } from '@/lib/orgs/mutations';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function redirectWithOAuthParams(redirectUri: string, params: Record<string, string>): NextResponse {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url.toString(), 302);
}

/**
 * Completes KAN-75's MCP OAuth 2.1 consent step (the counterpart to
 * `apps/api`'s `GET /oauth/authorize`, which redirected the browser to
 * `apps/web`'s consent page with these same params). Re-validates
 * `client_id`/`redirect_uri` registration itself (never trusts the form
 * body blindly, even though the consent page's own hidden fields came from
 * an already-validated `/oauth/authorize` redirect) *before* building any
 * redirect through `redirect_uri` — an unvalidated redirect target would be
 * an open-redirect vector. Approving calls straight into
 * `issueMcpAuthorizationCode`, which re-checks the signed-in user's current
 * `mcp.read` permission for the chosen project one more time (defense in
 * depth: the consent *page* already only offered eligible projects, but a
 * client could still POST an arbitrary `target`).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const clientId = field(formData, 'client_id');
  const redirectUri = field(formData, 'redirect_uri');
  const codeChallenge = field(formData, 'code_challenge');
  const codeChallengeMethod = field(formData, 'code_challenge_method');
  const state = field(formData, 'state');
  const target = field(formData, 'target');
  const decision = field(formData, 'decision');

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    await requireRegisteredMcpRedirectUri(clientId, redirectUri);
  } catch (err) {
    if (err instanceof InvalidMcpOAuthClientError) {
      return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
    }
    throw err;
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  if (decision !== 'approve') {
    return redirectWithOAuthParams(redirectUri, { error: 'access_denied', state });
  }

  const [organizationId, projectId] = target.split(':');
  if (!organizationId || !projectId) {
    return redirectWithOAuthParams(redirectUri, { error: 'invalid_request', state });
  }

  const { user } = await resolveOrgSessionContext(session);

  try {
    const { code } = await issueMcpAuthorizationCode({
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      organizationId,
      projectId,
      grantedByUserId: user.id,
    });
    return redirectWithOAuthParams(redirectUri, { code, state });
  } catch (err) {
    if (err instanceof InsufficientMcpReadPermissionError || err instanceof ProjectNotFoundError || err instanceof InvalidMcpOAuthClientError) {
      return redirectWithOAuthParams(redirectUri, { error: 'access_denied', state });
    }
    throw err;
  }
}
