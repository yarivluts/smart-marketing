/**
 * Growth Pilot reads a business's website the way a new marketer would: the home page, then the few
 * pages that say what is sold and to whom (products, services, pricing, about). Pure helpers: which
 * links on a page are worth reading next, in what order.
 */

/** How many pages one site read takes, the home page included. */
export const GROWTH_PILOT_MAX_PAGES = 6;

/** Paths that usually describe what a business sells or who it serves, best first. */
const PRIORITY_PATTERNS: readonly RegExp[] = [
  /product|catalog|shop|store|collection|item|\u05de\u05d5\u05e6\u05e8|\u05d7\u05e0\u05d5\u05ea|\u05e7\u05d8\u05dc\u05d5\u05d2/i,
  /service|solution|offer|what-we-do|\u05e9\u05d9\u05e8\u05d5\u05ea|\u05e4\u05ea\u05e8\u05d5\u05e0/i,
  /pricing|price|plans?\b|package|\u05de\u05d7\u05d9\u05e8|\u05ea\u05de\u05d7\u05d5\u05e8|\u05de\u05e1\u05dc\u05d5\u05dc|\u05d7\u05d1\u05d9\u05dc\u05d5\u05ea/i,
  /about|who-we-are|company|team|\u05d0\u05d5\u05d3\u05d5\u05ea|\u05de\u05d9-\u05d0\u05e0\u05d7\u05e0\u05d5/i,
  /feature|how-it-works|use-case|industr|customers?|clients?|\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea|\u05ea\u05db\u05d5\u05e0\u05d5\u05ea|\u05d0\u05d9\u05da-\u05d6\u05d4-\u05e2\u05d5\u05d1\u05d3/i,
];

/** Paths that never describe the offer: accounts, legal, carts, media, feeds. */
const SKIPPED_PATTERN =
  /login|signin|sign-in|signup|sign-up|register|account|cart|checkout|basket|privacy|terms|cookie|legal|accessibility|careers|jobs|\/tag\/|\/author\/|\/feed|\.(?:pdf|jpe?g|png|gif|svg|webp|zip|mp4|xml|css|js)(?:$|\?)|wp-admin|wp-json|mailto:|tel:|javascript:|whatsapp/i;

function decodeHref(raw: string): string {
  return raw.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').trim();
}

/**
 * The same-site links on a page worth reading next: same host (www. ignored), https, no fragments
 * or query noise, not the page itself, nothing that is an account, legal or media link; ordered by
 * how likely they describe what is sold, then by where they appear. At most `limit`.
 */
export function pickSiteLinks(html: string, pageUrl: string, limit: number = GROWTH_PILOT_MAX_PAGES - 1): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const host = base.hostname.replace(/^www\./, '');
  const seen = new Set<string>([normalize(base)]);
  const found: { url: string; rank: number; at: number }[] = [];
  let at = 0;
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const raw = decodeHref(match[1] ?? match[2] ?? match[3] ?? '');
    if (!raw || raw.startsWith('#') || SKIPPED_PATTERN.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || url.hostname.replace(/^www\./, '') !== host) continue;
    if (SKIPPED_PATTERN.test(url.pathname)) continue;
    url.protocol = 'https:';
    url.hash = '';
    url.search = '';
    const key = normalize(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const path = safeDecode(url.pathname);
    const index = PRIORITY_PATTERNS.findIndex((pattern) => pattern.test(path));
    found.push({ url: url.toString(), rank: index === -1 ? PRIORITY_PATTERNS.length : index, at: at++ });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .slice(0, Math.max(0, limit))
    .map((link) => link.url);
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function normalize(url: URL): string {
  return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`;
}

/** A site address as a person typed it ("easysign.co.il", "https://www.x.com/") as a full https URL; null when it is not one. */
export function normalizeSiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
  url.protocol = 'https:';
  url.hash = '';
  return url.toString();
}

/** The host a person recognizes their site by ("easysign.co.il"). */
export function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
