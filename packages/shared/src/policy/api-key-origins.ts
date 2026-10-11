/**
 * The web origins a publishable (browser) API key accepts events from. A publishable key is public
 * by design - it ships in the page - so the origin check is what keeps another site from sending
 * data in its name. Browsers set `Origin` themselves and scripts cannot forge it; a non-browser
 * caller can, which is why a publishable key can only ever send events (never entities, measures,
 * backfills or reads of data).
 *
 * Accepted forms: `https://app.example.com`, `http://localhost:3000`, and one leading wildcard
 * label for subdomains, `https://*.example.com` (which does not match `https://example.com`
 * itself - list both when both are used). Paths, queries and credentials are not allowed.
 */

export const MAX_ALLOWED_ORIGINS = 20;

export type AllowedOriginIssue = 'invalid_origin' | 'too_many_origins' | 'no_origins';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * An origin as stored: lower-case `scheme://host[:port]`, the default port dropped. Null when the
 * value is not a plain http(s) origin (it has a path, a query, credentials, or is not a URL).
 */
export function normalizeAllowedOrigin(value: string): string | null {
  const raw = value.trim().replace(/\/+$/, '');
  const wildcard = /^(https?):\/\/\*\.(.+)$/i.exec(raw);
  const candidate = wildcard ? `${wildcard[1]}://wildcard-placeholder.${wildcard[2]}` : raw;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) return null;
  // Plain http only for local development: a live site sending over http would leak the traffic anyway.
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) return null;
  const host = url.host.toLowerCase();
  if (wildcard) {
    const base = host.replace(/^wildcard-placeholder\./, '');
    // A wildcard needs a registrable base, not a bare TLD: *.com would let anyone in.
    if (!base.includes('.')) return null;
    return `${url.protocol}//*.${base}`;
  }
  return `${url.protocol}//${host}`;
}

/** Why a list of allowed origins cannot be saved; null when it can. */
export function allowedOriginsIssue(origins: readonly string[]): AllowedOriginIssue | null {
  if (origins.length === 0) return 'no_origins';
  if (origins.length > MAX_ALLOWED_ORIGINS) return 'too_many_origins';
  if (origins.some((origin) => normalizeAllowedOrigin(origin) === null)) return 'invalid_origin';
  return null;
}

/** The list as stored: normalized, without repeats. Invalid entries are dropped (check `allowedOriginsIssue` first). */
export function normalizeAllowedOrigins(origins: readonly string[]): string[] {
  return [...new Set(origins.map(normalizeAllowedOrigin).filter((origin): origin is string => origin !== null))];
}

/** Whether a request's `Origin` header is one the key allows. */
export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin) return false;
  const normalized = normalizeAllowedOrigin(origin);
  if (!normalized || normalized.includes('*')) return false;
  const [scheme, host] = normalized.split('://');
  return allowed.some((entry) => {
    if (entry === normalized) return true;
    const wildcard = /^(https?):\/\/\*\.(.+)$/.exec(entry);
    return Boolean(wildcard && wildcard[1] === scheme.replace(':', '') && host.endsWith(`.${wildcard[2]}`));
  });
}
