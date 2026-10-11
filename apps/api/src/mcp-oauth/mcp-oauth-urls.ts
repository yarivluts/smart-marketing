const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const DEFAULT_WEB_APP_URL = 'http://localhost:3000';

/** This API's own public base URL — the MCP OAuth issuer/resource identifier (`.well-known/oauth-authorization-server`'s `issuer`, `.well-known/oauth-protected-resource`'s `resource`). Mirrors `apps/web`'s own `NEXT_PUBLIC_INGEST_API_URL`-style "env var with a `localhost` dev default" convention. */
export function apiBaseUrl(): string {
  return process.env.GROWTHOS_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

/** Where `/oauth/authorize` redirects the browser for login + consent — `apps/web`'s own base URL, since that's the only place a Firebase session cookie and this codebase's i18n'd UI live. */
export function webAppUrl(): string {
  return process.env.GROWTHOS_WEB_APP_URL ?? DEFAULT_WEB_APP_URL;
}

/**
 * Refuses to start a deployed API (any GROWTHOS_ENV other than dev) whose public URLs are unset or
 * point at localhost. Both fell back to the localhost defaults above in production for weeks:
 * the MCP OAuth discovery documents advertised `http://localhost:3001` as issuer and endpoints -
 * so no OAuth MCP client could sign in against prod - and the ingest contract and the setup tools'
 * how_to_fix links pointed at localhost too. A failed start keeps Cloud Run on the previous
 * revision, which surfaces the misconfiguration at deploy time instead of in a customer's client.
 */
export function assertPublicUrlsConfigured(env: NodeJS.ProcessEnv = process.env): void {
  const environment = env.GROWTHOS_ENV;
  if (environment === undefined || environment === 'dev') {
    return;
  }
  const problems = (['GROWTHOS_API_BASE_URL', 'GROWTHOS_WEB_APP_URL'] as const).flatMap((name) => {
    const value = env[name];
    if (value === undefined || value.trim().length === 0) {
      return [`${name} is not set`];
    }
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value) ? [`${name} points at ${value}`] : [];
  });
  if (problems.length > 0) {
    throw new Error(`GROWTHOS_ENV=${environment} needs its public URLs: ${problems.join('; ')}.`);
  }
}
