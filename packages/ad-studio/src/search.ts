import { z } from 'zod/v4';
import {
  buildSearchAdPrompt,
  cleanKeywordSeeds,
  fitSearchAd,
  planToScriptContext,
  searchTargetingToGoogle,
  type AdStudioKeywordIdea,
  type AdStudioSearchTargeting,
} from '@growthos/shared';
import {
  adStudioBriefInput,
  generateGoogleAdsKeywordIdeas,
  getAdStudioBrief,
  GoogleAdsKeywordIdeasError,
  resolveAdStudioKeywordCredential,
  saveAdStudioSearchAd,
  type AdStudioBriefModel,
  type KmsProvider,
} from '@growthos/firebase-orm-models';
import { ensureOrm } from './runtime';
import { meteredCall, type AdStudioCallContext } from './metering';
import { serverKms } from './planning-sources';

/** How many ideas a research lookup asks Google for, and how many it keeps (busiest first). */
const RESEARCH_PAGE_SIZE = 200;
const RESEARCH_KEPT = 100;

export type AdStudioKeywordResearchUnavailable =
  | 'no_google_ads_credential'
  | 'credential_not_configured'
  | 'vault_not_configured'
  | 'no_seeds'
  | 'google_ads_auth_failed'
  | 'developer_token_not_approved'
  | 'google_ads_error';

export type AdStudioKeywordResearch =
  | { status: 'ok'; seeds: string[]; url: string | null; targeting: AdStudioSearchTargeting; ideas: AdStudioKeywordIdea[] }
  | { status: 'unavailable'; reason: AdStudioKeywordResearchUnavailable };

const FAILURE_REASON = {
  auth_failed: 'google_ads_auth_failed',
  developer_token_not_approved: 'developer_token_not_approved',
  api_error: 'google_ads_error',
} as const;

function microsToAmount(micros: number | null): number | null {
  return micros === null ? null : Math.round(micros / 10_000) / 100;
}

/**
 * Keyword ideas with Google's own monthly volumes, competition and top-of-page bids, for seed
 * phrases and/or a URL, in the country and language a person chose - the research behind a search
 * ad. Uses the project's attached Google Ads credential (decrypted in memory for this call only).
 * A Google API call, not an AI one: nothing is metered. Never throws for a missing or refused
 * credential; it says why instead.
 */
export async function researchAdStudioKeywords(params: {
  organizationId: string;
  projectId: string;
  seeds: readonly string[];
  url?: string | null;
  targeting: AdStudioSearchTargeting;
  kms?: KmsProvider | null;
  fetchImpl?: typeof fetch;
}): Promise<AdStudioKeywordResearch> {
  await ensureOrm();
  const seeds = cleanKeywordSeeds(params.seeds);
  const url = params.url && /^https?:\/\/\S+$/i.test(params.url.trim()) ? params.url.trim() : null;
  if (seeds.length === 0 && !url) return { status: 'unavailable', reason: 'no_seeds' };
  const resolved = await resolveAdStudioKeywordCredential(params.organizationId, params.projectId, params.kms === undefined ? serverKms() : params.kms);
  if (resolved.status !== 'ok') return { status: 'unavailable', reason: resolved.reason };
  const google = searchTargetingToGoogle(params.targeting);
  let ideas;
  try {
    ideas = await generateGoogleAdsKeywordIdeas(
      resolved.credential,
      { keywords: seeds, url, language: google.language, geoTargetConstants: google.geoTargetConstants, pageSize: RESEARCH_PAGE_SIZE },
      params.fetchImpl,
    );
  } catch (error) {
    if (error instanceof GoogleAdsKeywordIdeasError) return { status: 'unavailable', reason: FAILURE_REASON[error.failure] };
    throw error;
  }
  return {
    status: 'ok',
    seeds,
    url,
    targeting: params.targeting,
    ideas: [...ideas]
      .sort((a, b) => (b.avgMonthlySearches ?? -1) - (a.avgMonthlySearches ?? -1))
      .slice(0, RESEARCH_KEPT)
      .map((idea) => ({
        keyword: idea.text,
        avgMonthlySearches: idea.avgMonthlySearches,
        competition: idea.competition,
        lowTopOfPageBid: microsToAmount(idea.lowTopOfPageBidMicros),
        highTopOfPageBid: microsToAmount(idea.highTopOfPageBidMicros),
      })),
  };
}

/** The responsive search ad a model writes; `fitSearchAd` enforces Google's limits afterwards. */
export const SearchAdSchema = z.object({
  headlines: z.array(z.string()).describe('15 headlines, each at most 30 characters.'),
  descriptions: z.array(z.string()).describe('4 descriptions, each at most 90 characters.'),
  path1: z.string().describe('At most 15 characters, no spaces.'),
  path2: z.string().describe('At most 15 characters, no spaces.'),
});

/**
 * Writes the ad's responsive search ad in one metered text call (kind `search_ad`) from the brief,
 * the plan and the keywords it bids on, fits it to Google's limits and saves it - replacing the
 * saved one, so the page asks first when there is one.
 */
export async function writeAdStudioSearchAd(ctx: AdStudioCallContext & { briefId: string }): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const prompt = buildSearchAdPrompt(adStudioBriefInput(brief), brief.search_keywords?.keywords ?? [], context);
  const written = await meteredCall(ctx, 'search_ad', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: SearchAdSchema }));
  return saveAdStudioSearchAd({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, ad: fitSearchAd(written), now: ctx.now });
}
