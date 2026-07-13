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
