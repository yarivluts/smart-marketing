import {
  buildKeywordSeeds,
  extractLandingPageContent,
  keywordTargetingForLanguage,
  type AdStudioBriefInput,
  type AdStudioEvidence,
  type AdStudioKeywordIdea,
} from '@growthos/shared';
import {
  assertPublicHttpsUrl,
  generateGoogleAdsKeywordIdeas,
  getAdStudioCampaignEvidence,
  getLandingPageResults,
  GoogleAdsKeywordIdeasError,
  InvalidBackfillEndpointError,
  resolveAdStudioKeywordCredential,
  type HostResolver,
  type KmsProvider,
  type WarehouseQueryExecutor,
} from '@growthos/firebase-orm-models';
import { VaultNotConfiguredError } from '@growthos/firebase-orm-models';
import { getServerKmsProvider } from './runtime';

/**
 * The Ad Studio's evidence gathering (KAN-230), server-only. Each source returns what it measured or
 * `unavailable` with a stable reason; none of them ever fills a gap with a guess. Network access is
 * injectable (`fetchImpl`, `resolver`) so tests never reach a real site or a paid API.
 */

export const LANDING_PAGE_TIMEOUT_MS = 10_000;
export const LANDING_PAGE_MAX_BYTES = 1_500_000;
export const LANDING_PAGE_MAX_REDIRECTS = 3;
/** The warehouse window a plan reads: the last 90 days, today included. */
export const PLAN_RESULTS_DAYS = 90;
const KEYWORD_IDEAS_PAGE_SIZE = 50;
const KEYWORD_IDEAS_KEPT = 25;

export interface PlanningSourceDeps {
  fetchImpl?: typeof fetch;
  resolver?: HostResolver;
  warehouseExecutor?: WarehouseQueryExecutor;
  /** The vault's KMS provider; `null` for "no vault configured", `undefined` to read it from the deployment. */
  kms?: KmsProvider | null;
  now?: Date;
}

type LandingPageState = AdStudioEvidence['landingPage'];

/** Reads up to `limit` bytes of a body and stops; a longer page is parsed from its first part. */
async function readCapped(response: Response, limit: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(await response.arrayBuffer()).slice(0, limit), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = limit - total;
    chunks.push(value.length > room ? value.slice(0, room) : value);
    total += Math.min(value.length, room);
    if (value.length >= room) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, truncated };
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/["']/g, '') ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Fetches the brief's landing page from GrowthOS's own servers, so it gets the backfill loop's SSRF
 * guard (`assertPublicHttpsUrl`): https only, no credentials in the URL, and every address the host
 * resolves to must be public - re-checked on every redirect hop, which is followed by hand (at most
 * {@link LANDING_PAGE_MAX_REDIRECTS}). An `http:` URL is read over https instead, never over plain
 * http. No cookies or auth are sent; the whole read shares one {@link LANDING_PAGE_TIMEOUT_MS} budget
 * and stops at {@link LANDING_PAGE_MAX_BYTES}.
 */
export async function fetchLandingPage(rawUrl: string | null, deps: PlanningSourceDeps = {}): Promise<LandingPageState> {
  if (!rawUrl) return { status: 'unavailable', reason: 'no_url' };
  const fetchImpl = deps.fetchImpl ?? fetch;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { status: 'unavailable', reason: 'blocked_url' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  const signal = AbortSignal.timeout(LANDING_PAGE_TIMEOUT_MS);

  for (let hop = 0; hop <= LANDING_PAGE_MAX_REDIRECTS; hop += 1) {
    try {
      await assertPublicHttpsUrl(url.toString(), deps.resolver);
    } catch (error) {
      if (error instanceof InvalidBackfillEndpointError) return { status: 'unavailable', reason: 'blocked_url' };
      throw error;
    }
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal,
        headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', 'user-agent': 'GrowthOS-AdStudio/1.0 (+landing page analysis)' },
      });
    } catch {
      return { status: 'unavailable', reason: signal.aborted ? 'timeout' : 'fetch_failed' };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) return { status: 'unavailable', reason: 'http_error' };
      try {
        url = new URL(location, url);
      } catch {
        return { status: 'unavailable', reason: 'blocked_url' };
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 'unavailable', reason: 'http_error' };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 'unavailable', reason: 'not_html' };
    }
    let html: string;
    try {
      html = decode((await readCapped(response, LANDING_PAGE_MAX_BYTES)).bytes, contentType);
    } catch {
      return { status: 'unavailable', reason: signal.aborted ? 'timeout' : 'fetch_failed' };
    }
    const page = extractLandingPageContent(html);
    if (!page.title && !page.description && page.headings.length === 0 && !page.text) return { status: 'unavailable', reason: 'empty_page' };
    return { status: 'ok', url: url.toString(), ...page };
  }
  return { status: 'unavailable', reason: 'too_many_redirects' };
}

function utcDayOffset(now: Date, daysBack: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)).toISOString().slice(0, 10);
}

/** Visitors and conversions per landing page and campaign in the page's selected environment, last 90 days. */
export async function gatherResults(
  organizationId: string,
  projectId: string,
  environment: { id: string; name: string } | null,
  deps: PlanningSourceDeps = {},
): Promise<AdStudioEvidence['results']> {
  if (!environment) return { status: 'unavailable', reason: 'no_environment' };
  const since = utcDayOffset(deps.now ?? new Date(), PLAN_RESULTS_DAYS - 1);
  const outcome = await getLandingPageResults({ organizationId, projectId, environmentId: environment.id, since, executor: deps.warehouseExecutor });
  if (outcome.status === 'not_configured') return { status: 'unavailable', reason: 'warehouse_not_configured' };
  if (outcome.status === 'quota_exceeded') return { status: 'unavailable', reason: 'query_quota_exceeded' };
  if (outcome.status === 'error') return { status: 'unavailable', reason: 'warehouse_error' };
  if (outcome.totals.visitors === 0 && outcome.totals.conversions === 0) return { status: 'unavailable', reason: 'no_traffic' };
  return {
    status: 'ok',
    environmentName: environment.name,
    since,
    days: PLAN_RESULTS_DAYS,
    totals: outcome.totals,
    landingPages: outcome.landingPages,
    campaigns: outcome.campaigns,
  };
}

/** The deployment's vault, or null when none is configured (every stored secret is then unreadable). */
export function serverKms(): KmsProvider | null {
  try {
    return getServerKmsProvider();
  } catch (error) {
    if (error instanceof VaultNotConfiguredError) return null;
    throw error;
  }
}

function microsToAmount(micros: number | null): number | null {
  return micros === null ? null : Math.round(micros / 10_000) / 100;
}

const FAILURE_REASON = {
  auth_failed: 'google_ads_auth_failed',
  developer_token_not_approved: 'developer_token_not_approved',
  api_error: 'google_ads_error',
} as const;

/**
 * Keyword ideas with Google's own monthly search volumes, from the project's attached Google Ads
 * credential (decrypted in memory for this call only). Seeded with the landing page URL - only when
 * it was publicly readable - and short phrases from the page's headings and the brief; targeted by
 * the ad's language. The busiest ideas are kept; volumes Google did not report stay null.
 */
export async function gatherKeywords(
  organizationId: string,
  projectId: string,
  brief: AdStudioBriefInput,
  landingPage: LandingPageState,
  deps: PlanningSourceDeps = {},
): Promise<AdStudioEvidence['keywords']> {
  const kms = deps.kms === undefined ? serverKms() : deps.kms;
  const resolved = await resolveAdStudioKeywordCredential(organizationId, projectId, kms);
  if (resolved.status !== 'ok') return { status: 'unavailable', reason: resolved.reason };
  const seedKeywords = buildKeywordSeeds(brief, landingPage.status === 'ok' ? landingPage.headings : []);
  const seedUrl = landingPage.status === 'ok' ? landingPage.url : null;
  if (seedKeywords.length === 0 && !seedUrl) return { status: 'unavailable', reason: 'no_seeds' };
  const targeting = keywordTargetingForLanguage(brief.language);
  let ideas;
  try {
    ideas = await generateGoogleAdsKeywordIdeas(
      resolved.credential,
      { keywords: seedKeywords, url: seedUrl, language: targeting.language, geoTargetConstants: targeting.geoTargetConstants, pageSize: KEYWORD_IDEAS_PAGE_SIZE },
      deps.fetchImpl,
    );
  } catch (error) {
    if (error instanceof GoogleAdsKeywordIdeasError) return { status: 'unavailable', reason: FAILURE_REASON[error.failure] };
    throw error;
  }
  if (ideas.length === 0) return { status: 'unavailable', reason: 'no_ideas' };
  const shaped: AdStudioKeywordIdea[] = [...ideas]
    .sort((a, b) => (b.avgMonthlySearches ?? -1) - (a.avgMonthlySearches ?? -1))
    .slice(0, KEYWORD_IDEAS_KEPT)
    .map((idea) => ({
      keyword: idea.text,
      avgMonthlySearches: idea.avgMonthlySearches,
      competition: idea.competition,
      lowTopOfPageBid: microsToAmount(idea.lowTopOfPageBidMicros),
      highTopOfPageBid: microsToAmount(idea.highTopOfPageBidMicros),
    }));
  return { status: 'ok', seedKeywords, seedUrl, language: targeting.language, geoTargets: targeting.geoTargetConstants, ideas: shaped };
}

/** Every source, gathered concurrently; the keyword lookup waits only for the landing page it seeds from. */
export async function gatherAdStudioEvidence(params: {
  organizationId: string;
  projectId: string;
  brief: AdStudioBriefInput;
  environment: { id: string; name: string } | null;
  deps?: PlanningSourceDeps;
}): Promise<AdStudioEvidence> {
  const deps = params.deps ?? {};
  const landingPagePromise = fetchLandingPage(params.brief.landingPageUrl, deps);
  const [landingPage, results, campaigns, keywords] = await Promise.all([
    landingPagePromise,
    gatherResults(params.organizationId, params.projectId, params.environment, deps),
    // Campaigns across the whole project, as the automation page lists them: a target's environment is
    // whatever its import or seed named, not necessarily one of the project's environments.
    getAdStudioCampaignEvidence(params.organizationId, params.projectId, null),
    landingPagePromise.then((page) => gatherKeywords(params.organizationId, params.projectId, params.brief, page, deps)),
  ]);
  return { landingPage, results, campaigns, keywords };
}
