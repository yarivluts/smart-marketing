import { AD_STUDIO_MAX_TOTAL_SECONDS } from './scenes';

/**
 * Automated full-page website capture and smooth scrolling video selection:
 * scans a public website (homepage + ad-relevant product/offer pages), saves full-page
 * screenshots, and renders smooth scrolling clips that weave directly into Ad Studio videos
 * without requiring special credentials.
 */

export const AD_STUDIO_SITE_SCROLL_MAX_PAGES = 3;
export const AD_STUDIO_SITE_SCROLL_MAX_INSERTS = 2;
export const AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS = 4;
export const AD_STUDIO_SITE_SCROLL_MIN_SECONDS = 3;
export const AD_STUDIO_SITE_SCROLL_MAX_SECONDS = 10;

export const AD_STUDIO_SITE_PAGE_KINDS = ['home', 'product', 'page'] as const;
export type AdStudioSitePageKind = (typeof AD_STUDIO_SITE_PAGE_KINDS)[number];

/** Stored record on `AdStudioBriefModel.site_pages`. */
export interface AdStudioSiteScrollPage {
  id: string;
  url: string;
  title: string;
  kind: AdStudioSitePageKind;
  relevanceReason: string;
  screenshotGcsPath: string;
  scrollVideoGcsPath: string;
  durationSeconds: number;
  selected: boolean;
  capturedOn: string;
}

/** Browser view returned by API routes and rendered in the Ad Studio UI. */
export interface AdStudioSiteScrollPageView {
  id: string;
  url: string;
  hostAndPath: string;
  title: string;
  kind: AdStudioSitePageKind;
  relevanceReason: string;
  screenshotUrl: string;
  videoUrl: string;
  durationSeconds: number;
  selected: boolean;
  capturedOn: string;
}

export interface RankedSitePageCandidate {
  url: string;
  suggestedTitle: string;
  kind: AdStudioSitePageKind;
  score: number;
}

const NOISE_PATH_PATTERN =
  /\/(login|signin|sign-in|signup|sign-up|register|logout|signout|cart|checkout|basket|privacy|terms|legal|accessibility|cookie|policies|wp-admin|admin|account|reset-password|forgot-password)(\/|$)/i;
const BINARY_EXTENSION_PATTERN =
  /\.(pdf|zip|gz|tar|rar|7z|png|jpe?g|webp|gif|svg|ico|mp4|webm|mov|avi|mp3|wav|ogg|css|js|json|xml)(\?|$)/i;
const COMMERCIAL_PATH_BONUS =
  /\/(products?|services?|solutions?|features?|courses?|pricing|plans?|shop|store|item|program|about|how-it-works)/i;

/** Normalizes a user-supplied or discovered website link to clean `https://`, or null if invalid. */
export function normalizeSitePageUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || !parsed.hostname) return null;
  parsed.protocol = 'https:';
  parsed.hash = '';
  return parsed.toString();
}

/** Concise `host/path` display string without trailing slash on root. */
export function formatHostAndPath(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const pathPart = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.host}${pathPart}`;
  } catch {
    return rawUrl;
  }
}

function registrableKey(host: string): string {
  const lower = host.toLowerCase().replace(/^www\./, '');
  const parts = lower.split('.');
  if (parts.length <= 2) return lower;
  const tld = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  const countrySecond = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'muni', 'ltd']);
  if (tld.length === 2 && countrySecond.has(second) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function tokenize(text: string): Set<string> {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // Keep original text on malformed URI sequences.
  }
  const matches = decoded.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu);
  return new Set(matches ?? []);
}

function dedupeKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const normalizedPath = u.pathname === '/' ? '/' : u.pathname.replace(/\/+$/, '');
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${normalizedPath}${u.search}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Picks homepage + most ad-relevant same-site product/service pages from discovered links.
 * Pure & deterministic so it runs even when no text model key or quota is present.
 */
export function rankCandidateSitePages(params: {
  startUrl: string;
  links: readonly { url: string; text: string }[];
  adName: string;
  productDescription: string;
  objective: string;
  maxPages?: number;
}): RankedSitePageCandidate[] {
  const start = normalizeSitePageUrl(params.startUrl);
  if (!start) return [];
  const startParsed = new URL(start);
  const allowedSite = registrableKey(startParsed.hostname);
  const maxPages = Math.max(1, params.maxPages ?? AD_STUDIO_SITE_SCROLL_MAX_PAGES);
  const adTokens = tokenize(`${params.adName} ${params.productDescription} ${params.objective}`);

  const chosen: RankedSitePageCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (entry: RankedSitePageCandidate) => {
    const key = dedupeKey(entry.url);
    if (seen.has(key)) return;
    seen.add(key);
    chosen.push(entry);
  };

  const startIsRoot = startParsed.pathname === '/' || startParsed.pathname === '';
  pushCandidate({
    url: start,
    suggestedTitle: startIsRoot ? startParsed.hostname : formatHostAndPath(start),
    kind: startIsRoot ? 'home' : 'product',
    score: 1000,
  });

  if (!startIsRoot && chosen.length < maxPages) {
    const homeUrl = `${startParsed.origin}/`;
    pushCandidate({
      url: homeUrl,
      suggestedTitle: startParsed.hostname,
      kind: 'home',
      score: 900,
    });
  }

  const scored: RankedSitePageCandidate[] = [];
  for (const link of params.links) {
    const normalized = normalizeSitePageUrl(link.url);
    if (!normalized) continue;
    const u = new URL(normalized);
    if (registrableKey(u.hostname) !== allowedSite) continue;
    if (BINARY_EXTENSION_PATTERN.test(u.pathname) || NOISE_PATH_PATTERN.test(u.pathname)) continue;
    if (seen.has(dedupeKey(normalized))) continue;

    const cleanPath = u.pathname === '/' ? '/' : u.pathname;
    const isHome = cleanPath === '/';
    const title = link.text.replace(/\s+/g, ' ').trim().slice(0, 80) || formatHostAndPath(normalized);
    const linkTokens = tokenize(`${link.text} ${u.pathname.replace(/[-_/]+/g, ' ')}`);

    let overlap = 0;
    for (const token of linkTokens) {
      if (adTokens.has(token)) overlap += 1;
    }
    const commercial = COMMERCIAL_PATH_BONUS.test(u.pathname) ? 3 : 0;
    const kind: AdStudioSitePageKind = isHome ? 'home' : commercial > 0 || overlap > 0 ? 'product' : 'page';
    const depthPenalty = Math.max(0, cleanPath.split('/').filter(Boolean).length - 2);
    const queryPenalty = u.search ? 2 : 0;
    const score = overlap * 10 + commercial + (title ? 1 : 0) - depthPenalty - queryPenalty;
    scored.push({ url: normalized, suggestedTitle: title, kind, score });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const item of scored) {
    if (chosen.length >= maxPages) break;
    pushCandidate(item);
  }
  return chosen.slice(0, maxPages);
}

/**
 * Selects up to {@link AD_STUDIO_SITE_SCROLL_MAX_INSERTS} checked scrolling site-page clips that
 * fit within the remaining seconds of the 60-second video cap.
 */
export function planSiteScrollInserts(params: {
  pages: readonly Pick<AdStudioSiteScrollPage, 'id' | 'durationSeconds' | 'selected'>[];
  sceneSeconds: number;
  maxTotalSeconds?: number;
}): { pageId: string; seconds: number }[] {
  const cap = params.maxTotalSeconds ?? AD_STUDIO_MAX_TOTAL_SECONDS;
  let remaining = Math.max(0, cap - params.sceneSeconds);
  const inserts: { pageId: string; seconds: number }[] = [];

  for (const page of params.pages) {
    if (!page.selected || inserts.length >= AD_STUDIO_SITE_SCROLL_MAX_INSERTS) continue;
    const desired = Math.min(
      AD_STUDIO_SITE_SCROLL_MAX_SECONDS,
      Math.max(AD_STUDIO_SITE_SCROLL_MIN_SECONDS, Math.round(page.durationSeconds || AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS)),
    );
    const duration = Math.min(desired, remaining);
    if (duration < 2) break;
    inserts.push({ pageId: page.id, seconds: duration });
    remaining -= duration;
  }

  return inserts;
}
