import 'server-only';

/**
 * Cloud Scheduler calls the cron routes with a Google-signed OIDC identity token for one service
 * account. A request counts as the scheduler only when Google itself vouches for that token
 * (tokeninfo), it was minted for this audience, by that account, with a verified email, and has not
 * expired. Anything else - no token, someone else's, an expired one, or no configuration - is refused.
 */

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export interface SchedulerIdentity {
  /** The service account Cloud Scheduler mints its tokens as. */
  serviceAccount: string | null;
  /** The audience the job sets on its token (the route's URL). */
  audience: string | null;
}

export function schedulerIdentityFromEnv(env: NodeJS.ProcessEnv = process.env): SchedulerIdentity {
  return { serviceAccount: env.GROWTHOS_SCHEDULER_SA?.trim() || null, audience: env.GROWTHOS_SCHEDULER_AUDIENCE?.trim() || null };
}

export async function verifySchedulerRequest(
  authorization: string | null,
  identity: SchedulerIdentity = schedulerIdentityFromEnv(),
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<boolean> {
  if (!identity.serviceAccount || !identity.audience) return false;
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  if (!token) return false;
  let response: Response;
  try {
    response = await fetchImpl(`${TOKENINFO}?id_token=${encodeURIComponent(token)}`, { method: 'GET', signal: AbortSignal.timeout(10_000) });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const claims = (await response.json().catch(() => null)) as { iss?: string; aud?: string; email?: string; email_verified?: string | boolean; exp?: string | number } | null;
  if (!claims) return false;
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const expires = Number(claims.exp) * 1000;
  return (
    ISSUERS.has(String(claims.iss)) &&
    claims.aud === identity.audience &&
    claims.email === identity.serviceAccount &&
    verified &&
    Number.isFinite(expires) &&
    expires > now.getTime()
  );
}
