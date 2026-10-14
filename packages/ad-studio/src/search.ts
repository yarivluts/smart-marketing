import { z } from 'zod/v4';
import {
  AD_STUDIO_RSA_DESCRIPTION_MAX,
  AD_STUDIO_RSA_DESCRIPTIONS,
  AD_STUDIO_RSA_HEADLINE_MAX,
  AD_STUDIO_RSA_HEADLINES,
  buildKeywordChoicePrompt,
  buildSearchAdPrompt,
  cleanKeywordSeeds,
  fitSearchAd,
  planToScriptContext,
  sanitizeKeywordChoice,
  AD_STUDIO_MATCH_TYPES,
  searchTargetingToGoogle,
  type AdStudioKeywordIdea,
  type AdStudioSearchKeywords,
  type AdStudioSearchTargeting,
} from '@growthos/shared';
import {
  generateGoogleAdsKeywordIdeas,
  getAdStudioBrief,
  GoogleAdsKeywordIdeasError,
  resolveAdStudioKeywordCredential,
  saveAdStudioSearchAd,
  type AdStudioBriefModel,
  type KmsProvider,
} from '@growthos/firebase-orm-models';
import { briefPromptInput } from './brand';
import { ensureOrm } from './runtime';
import { meteredCall, type AdStudioCallContext } from './metering';
import { repairOverLength } from './length-repair';
import { AdStudioProviderError } from './llm';
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
  const prompt = buildSearchAdPrompt(await briefPromptInput(brief), brief.search_keywords?.keywords ?? [], context);
  const written = await meteredCall(ctx, 'search_ad', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: SearchAdSchema }));
  // Over-long headlines and descriptions are rewritten to fit rather than dropped or cut.
  const repaired = await repairOverLength(ctx, 'search_ad', brief.id, brief.language, [
    ...written.headlines.map((text, index) => ({ id: `h${index}`, text, max: AD_STUDIO_RSA_HEADLINE_MAX })),
    ...written.descriptions.map((text, index) => ({ id: `d${index}`, text, max: AD_STUDIO_RSA_DESCRIPTION_MAX })),
  ]);
  const ad = fitSearchAd({
    ...written,
    headlines: written.headlines.map((text, index) => repaired.get(`h${index}`) ?? text),
    descriptions: written.descriptions.map((text, index) => repaired.get(`d${index}`) ?? text),
  });
  // Refuse cleanly before saving when the model gave too little to make a valid ad.
  if (ad.headlines.length < AD_STUDIO_RSA_HEADLINES.min || ad.descriptions.length < AD_STUDIO_RSA_DESCRIPTIONS.min) {
    throw new AdStudioProviderError('invalid_output', 'The model returned too few usable headlines or descriptions for a search ad.');
  }
  return saveAdStudioSearchAd({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, ad, now: ctx.now });
}

/** The keywords and excluded searches a model chooses; `sanitizeKeywordChoice` checks them afterwards. */
export const KeywordChoiceSchema = z.object({
  keywords: z.array(z.object({ text: z.string(), matchType: z.enum(AD_STUDIO_MATCH_TYPES) })).describe('At most 15 keywords to bid on.'),
  negatives: z.array(z.string()).describe('At most 10 searches to exclude.'),
});

export interface AdStudioKeywordSuggestion {
  keywords: AdStudioSearchKeywords;
  /** True when the AI chose from Google's own ideas (with monthly searches). */
  researched: boolean;
  /** Why Google's ideas were not used, when the lookup was unavailable. */
  reason: AdStudioKeywordResearchUnavailable | null;
}

/**
 * Lets the AI choose the search ad's keywords, match types and excluded searches, so a person who
 * does not know Google Ads only has to review them: from Google's own ideas when the project's
 * Google Ads credential can look them up, otherwise from the brief and the plan alone (no volumes).
 * One metered text call (kind `keyword_choice`). Nothing is saved - the person reviews and saves.
 */
export async function suggestAdStudioKeywords(
  ctx: AdStudioCallContext & { briefId: string; targeting: AdStudioSearchTargeting; seeds: readonly string[]; url?: string | null; kms?: KmsProvider | null; fetchImpl?: typeof fetch },
): Promise<AdStudioKeywordSuggestion> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const context = brief.plan ? planToScriptContext(brief.plan, brief.plan_sources) : {};
  const seeds = cleanKeywordSeeds([...ctx.seeds, ...(context.keywordThemes ?? []), brief.name]);
  const research = await researchAdStudioKeywords({ organizationId: ctx.organizationId, projectId: ctx.projectId, seeds, url: ctx.url ?? brief.landing_page_url ?? null, targeting: ctx.targeting, kms: ctx.kms, fetchImpl: ctx.fetchImpl });
  const ideas = research.status === 'ok' && research.ideas.length ? research.ideas : null;
  const prompt = buildKeywordChoicePrompt(await briefPromptInput(brief), ideas, context);
  const raw = await meteredCall(ctx, 'keyword_choice', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: KeywordChoiceSchema }));
  const chosen = sanitizeKeywordChoice(raw, ideas);
  if (chosen.keywords.length === 0) throw new AdStudioProviderError('invalid_output', 'The model chose no usable keywords.');
  return {
    keywords: { targeting: ctx.targeting, keywords: chosen.keywords, negatives: chosen.negatives },
    researched: ideas !== null,
    reason: research.status === 'unavailable' ? research.reason : null,
  };
}
