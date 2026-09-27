import { languageName, type AdStudioBriefInput, type AdStudioPrompt, type AdStudioScriptContext } from './prompts';

/**
 * Ad Studio deep planning (KAN-230): the evidence a plan is built from, the plan's shape, and the
 * pure steps around the model call - keyword seeding, prompt building and checking what the model
 * cited. Every evidence source is either `ok` with what was measured, or `unavailable` with a
 * stable reason code the UI translates; nothing here ever fills a gap with an estimate.
 */

/** The four sources a plan gathers before it asks the model anything. */
export const AD_STUDIO_EVIDENCE_SOURCES = ['landing_page', 'results', 'campaigns', 'keywords'] as const;
export type AdStudioEvidenceSource = (typeof AD_STUDIO_EVIDENCE_SOURCES)[number];

/** What a recommendation may cite: a gathered source, or `market` - the model's general knowledge, never measured. */
export const AD_STUDIO_CITATION_SOURCES = [...AD_STUDIO_EVIDENCE_SOURCES, 'market'] as const;
export type AdStudioCitationSource = (typeof AD_STUDIO_CITATION_SOURCES)[number];

/**
 * Why a source had nothing to give, per source. Stable codes: stored on the brief and translated in
 * the UI, so renaming one is a data migration.
 */
export const AD_STUDIO_UNAVAILABLE_REASONS = {
  landing_page: ['no_url', 'blocked_url', 'timeout', 'fetch_failed', 'http_error', 'not_html', 'too_many_redirects', 'empty_page'],
  results: ['no_environment', 'warehouse_not_configured', 'warehouse_error', 'query_quota_exceeded', 'no_traffic'],
  campaigns: ['no_campaigns'],
  keywords: [
    'no_google_ads_credential',
    'vault_not_configured',
    'credential_not_configured',
    'no_seeds',
    'google_ads_auth_failed',
    'developer_token_not_approved',
    'google_ads_error',
    'no_ideas',
  ],
} as const satisfies Record<AdStudioEvidenceSource, readonly string[]>;

export type AdStudioUnavailableReason<S extends AdStudioEvidenceSource> = (typeof AD_STUDIO_UNAVAILABLE_REASONS)[S][number];

export type AdStudioSourceState<T, R extends string = string> = ({ status: 'ok' } & T) | { status: 'unavailable'; reason: R };

export interface AdStudioLandingPageEvidence {
  /** The URL that was finally read, after any redirects. */
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  truncated: boolean;
}

export interface AdStudioResultsRow {
  /** The landing page URL or campaign id, exactly as the warehouse holds it. */
  key: string;
  visitors: number;
  conversions: number;
  /** conversions / visitors, 0-1; null with no visitors. */
  conversionRate: number | null;
}

export interface AdStudioResultsEvidence {
  environmentName: string;
  /** First day of the window, YYYY-MM-DD (UTC). */
  since: string;
  days: number;
  totals: Omit<AdStudioResultsRow, 'key'>;
  landingPages: AdStudioResultsRow[];
  campaigns: AdStudioResultsRow[];
}

export interface AdStudioCampaignAd {
  headline: string;
  primaryText: string;
  description: string;
}

export interface AdStudioCampaignSummary {
  label: string;
  platform: string | null;
  status: string | null;
  dailyBudgetUsd: number | null;
  ads: AdStudioCampaignAd[];
}

export interface AdStudioCampaignEvidence {
  campaigns: AdStudioCampaignSummary[];
}

export type AdStudioKeywordCompetition = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AdStudioKeywordIdea {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: AdStudioKeywordCompetition | null;
  /** Top-of-page bid range in the Google Ads account's currency; null when Google gave none. */
  lowTopOfPageBid: number | null;
  highTopOfPageBid: number | null;
}

export interface AdStudioKeywordEvidence {
  seedKeywords: string[];
  seedUrl: string | null;
  language: string | null;
  geoTargets: string[];
  ideas: AdStudioKeywordIdea[];
}

export interface AdStudioEvidence {
  landingPage: AdStudioSourceState<AdStudioLandingPageEvidence, AdStudioUnavailableReason<'landing_page'>>;
  results: AdStudioSourceState<AdStudioResultsEvidence, AdStudioUnavailableReason<'results'>>;
  campaigns: AdStudioSourceState<AdStudioCampaignEvidence, AdStudioUnavailableReason<'campaigns'>>;
  keywords: AdStudioSourceState<AdStudioKeywordEvidence, AdStudioUnavailableReason<'keywords'>>;
}

/**
 * What is stored on the brief for the UI to chart: the evidence without the landing page's full
 * text, which only the model needs and which is read fresh on every run.
 */
export interface AdStudioPlanSources {
  landingPage: AdStudioSourceState<Omit<AdStudioLandingPageEvidence, 'text'> & { textLength: number }, AdStudioUnavailableReason<'landing_page'>>;
  results: AdStudioEvidence['results'];
  campaigns: AdStudioEvidence['campaigns'];
  keywords: AdStudioEvidence['keywords'];
}

export type AdStudioRecommendationPriority = 'high' | 'medium' | 'low';

export interface AdStudioPlanCitation {
  source: AdStudioCitationSource;
  detail: string;
}

export interface AdStudioPlanRecommendation {
  title: string;
  rationale: string;
  priority: AdStudioRecommendationPriority;
  evidence: AdStudioPlanCitation[];
  /** Set by {@link sanitizeAdStudioPlan}: every citation it made was to a source that had no data. */
  unsupported?: boolean;
}

export interface AdStudioKeywordTheme {
  theme: string;
  keywords: string[];
  evidence: string;
}

export interface AdStudioPlan {
  summary: string;
  audience: string;
  /** What the landing page says, in brief; empty when the page could not be read. */
  landingPageSummary: string;
  messagingAngles: string[];
  keywordThemes: AdStudioKeywordTheme[];
  recommendations: AdStudioPlanRecommendation[];
  /** General market knowledge from the model - explicitly not measured data. */
  marketNotes: string[];
}

export function conversionRate(visitors: number, conversions: number): number | null {
  return visitors > 0 ? conversions / visitors : null;
}

export function availableEvidenceSources(evidence: Pick<AdStudioEvidence, 'landingPage' | 'results' | 'campaigns' | 'keywords'> | AdStudioPlanSources): AdStudioEvidenceSource[] {
  const states: Record<AdStudioEvidenceSource, { status: string }> = {
    landing_page: evidence.landingPage,
    results: evidence.results,
    campaigns: evidence.campaigns,
    keywords: evidence.keywords,
  };
  return AD_STUDIO_EVIDENCE_SOURCES.filter((source) => states[source].status === 'ok');
}

export function toAdStudioPlanSources(evidence: AdStudioEvidence): AdStudioPlanSources {
  const landingPage: AdStudioPlanSources['landingPage'] =
    evidence.landingPage.status === 'ok'
      ? {
          status: 'ok',
          url: evidence.landingPage.url,
          title: evidence.landingPage.title,
          description: evidence.landingPage.description,
          headings: [...evidence.landingPage.headings],
          truncated: evidence.landingPage.truncated,
          textLength: evidence.landingPage.text.length,
        }
      : evidence.landingPage;
  return { landingPage, results: evidence.results, campaigns: evidence.campaigns, keywords: evidence.keywords };
}

// ---------------------------------------------------------------------------------------------
// Keyword seeding
// ---------------------------------------------------------------------------------------------

/** Google Ads accepts 1-20 seed keywords; a handful of specific ones gives more relevant ideas than many vague ones. */
export const AD_STUDIO_MAX_SEED_KEYWORDS = 6;
const MIN_SEED_CHARS = 3;
const MAX_SEED_CHARS = 80;
const MAX_SEED_WORDS = 5;

function seedCandidates(text: string): string[] {
  return text
    .split(/[\n,;:|.!?()–—/]+|\s-\s/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= MIN_SEED_CHARS && part.length <= MAX_SEED_CHARS && part.split(' ').length <= MAX_SEED_WORDS);
}

/**
 * The seed keywords for a keyword-ideas lookup: short phrases from the landing page's main
 * headings (the words the business already leads with), then from the product description and
 * the ad name. Only phrases of at most five words qualify - a whole sentence is not a search
 * term - and duplicates are dropped case-insensitively.
 */
export function buildKeywordSeeds(brief: Pick<AdStudioBriefInput, 'name' | 'productDescription'>, landingPageHeadings: readonly string[] = []): string[] {
  const seeds: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [...landingPageHeadings.slice(0, 3).flatMap(seedCandidates), ...seedCandidates(brief.productDescription), ...seedCandidates(brief.name)]) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push(candidate);
    if (seeds.length >= AD_STUDIO_MAX_SEED_KEYWORDS) break;
  }
  return seeds;
}

export interface AdStudioKeywordTargeting {
  /** A Google Ads language constant resource name, or null to include every language. */
  language: string | null;
  geoTargetConstants: string[];
}

/**
 * Google Ads targeting for the ad's language: Hebrew ads look at Hebrew searches in Israel, English
 * ads at English searches everywhere. Any other language is looked up without a language filter
 * rather than guessed.
 */
export function keywordTargetingForLanguage(language: string): AdStudioKeywordTargeting {
  const base = language.toLowerCase().split('-')[0];
  if (base === 'he' || base === 'iw') return { language: 'languageConstants/1027', geoTargetConstants: ['geoTargetConstants/2376'] };
  if (base === 'en') return { language: 'languageConstants/1000', geoTargetConstants: [] };
  return { language: null, geoTargetConstants: [] };
}

// ---------------------------------------------------------------------------------------------
// The planning prompt
// ---------------------------------------------------------------------------------------------

const PROMPT_MAX_ROWS = 10;
const PROMPT_MAX_CAMPAIGNS = 15;
const PROMPT_MAX_ADS_PER_CAMPAIGN = 3;
const PROMPT_MAX_KEYWORDS = 30;

function percent(rate: number | null): string {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`;
}

function resultsLines(rows: readonly AdStudioResultsRow[]): string[] {
  return rows.slice(0, PROMPT_MAX_ROWS).map((row) => `- ${row.key}: visitors ${row.visitors}, conversions ${row.conversions}, conversion rate ${percent(row.conversionRate)}`);
}

function sourceHeader(source: AdStudioEvidenceSource, state: { status: string; reason?: string }): string {
  return state.status === 'ok' ? `### Evidence [${source}] - available` : `### Evidence [${source}] - UNAVAILABLE (reason: ${state.reason}). Do not cite it.`;
}

function landingPageSection(state: AdStudioEvidence['landingPage']): string[] {
  if (state.status !== 'ok') return [sourceHeader('landing_page', state)];
  return [
    sourceHeader('landing_page', state),
    `URL: ${state.url}`,
    state.title ? `Title: ${state.title}` : null,
    state.description ? `Meta description: ${state.description}` : null,
    state.headings.length ? `Headings: ${state.headings.join(' | ')}` : null,
    `Visible text${state.truncated ? ' (truncated)' : ''}: ${state.text}`,
  ].filter((line): line is string => line !== null);
}

function resultsSection(state: AdStudioEvidence['results']): string[] {
  if (state.status !== 'ok') return [sourceHeader('results', state)];
  return [
    sourceHeader('results', state),
    `Measured on the project's "${state.environmentName}" environment, last ${state.days} days (since ${state.since}). Visitors are summed daily landings; conversions are last-touch.`,
    `Totals: visitors ${state.totals.visitors}, conversions ${state.totals.conversions}, conversion rate ${percent(state.totals.conversionRate)}`,
    'By landing page:',
    ...resultsLines(state.landingPages),
    'By campaign id:',
    ...resultsLines(state.campaigns),
  ];
}

function campaignsSection(state: AdStudioEvidence['campaigns']): string[] {
  if (state.status !== 'ok') return [sourceHeader('campaigns', state)];
  return [
    sourceHeader('campaigns', state),
    ...state.campaigns.slice(0, PROMPT_MAX_CAMPAIGNS).flatMap((campaign) => [
      `- ${campaign.label} (platform ${campaign.platform ?? 'unknown'}, status ${campaign.status ?? 'unknown'}, daily budget ${campaign.dailyBudgetUsd === null ? 'unknown' : `${campaign.dailyBudgetUsd} USD`})`,
      ...campaign.ads
        .slice(0, PROMPT_MAX_ADS_PER_CAMPAIGN)
        .map((ad) => `  ad: ${[ad.headline && `headline "${ad.headline}"`, ad.primaryText && `text "${ad.primaryText}"`, ad.description && `description "${ad.description}"`].filter(Boolean).join(', ')}`),
    ]),
  ];
}

function keywordsSection(state: AdStudioEvidence['keywords']): string[] {
  if (state.status !== 'ok') return [sourceHeader('keywords', state)];
  return [
    sourceHeader('keywords', state),
    `Google Ads Keyword Planner ideas (language ${state.language ?? 'any'}, locations ${state.geoTargets.length ? state.geoTargets.join(', ') : 'all'}), seeded from: ${[...state.seedKeywords, ...(state.seedUrl ? [state.seedUrl] : [])].join('; ')}`,
    ...state.ideas
      .slice(0, PROMPT_MAX_KEYWORDS)
      .map(
        (idea) =>
          `- ${idea.keyword}: avg monthly searches ${idea.avgMonthlySearches ?? 'unknown'}, competition ${idea.competition ?? 'unknown'}${
            idea.lowTopOfPageBid !== null && idea.highTopOfPageBid !== null ? `, top-of-page bid ${idea.lowTopOfPageBid}-${idea.highTopOfPageBid} (account currency)` : ''
          }`,
      ),
  ];
}

const PLAN_RULES = [
  'Use only the evidence below and the brief. Do not invent facts, numbers, prices, customers, results or search volumes.',
  'Quote a number only if it appears in the evidence, exactly as given.',
  'Every recommendation cites the evidence it rests on: source is one of landing_page, results, campaigns, keywords (only sources marked available) or market, and detail says which fact it uses.',
  'Anything that is not in the evidence - how the market or the audience usually behaves, platform best practice, seasonality - is general knowledge: cite it as market and also list it in marketNotes. Never present it as measured.',
  'If a source is unavailable, do not cite it and do not guess what it would have shown.',
  'landingPageSummary summarizes what the landing page says; leave it empty if the landing page is unavailable.',
  'keywordThemes group related search terms; take keywords from the keyword evidence when it is available, and say in evidence where each theme comes from.',
  'Write summary, audience, messagingAngles, recommendations and marketNotes in the ad language. Keep keywords exactly as they appear in the evidence.',
  'Give 3 to 6 recommendations, most important first, focused on what the video ad should say and to whom.',
];

/** The instructions for the planning call: the brief, then each evidence source clearly marked. */
export function buildPlanPrompt(brief: AdStudioBriefInput, evidence: AdStudioEvidence): AdStudioPrompt {
  return {
    system: [
      'You are a performance-marketing strategist planning a short video ad. You work from evidence and say clearly what is measured and what is general knowledge.',
      'Rules:',
      ...PLAN_RULES.map((rule) => `- ${rule}`),
    ].join('\n'),
    user: [
      '## Brief',
      `Ad name: ${brief.name}`,
      `Objective: ${brief.objective}`,
      `Product: ${brief.productDescription}`,
      brief.landingPageUrl ? `Landing page: ${brief.landingPageUrl}` : null,
      `Ad language: ${languageName(brief.language)}`,
      '',
      ...landingPageSection(evidence.landingPage),
      '',
      ...resultsSection(evidence.results),
      '',
      ...campaignsSection(evidence.campaigns),
      '',
      ...keywordsSection(evidence.keywords),
      '',
      '### [market] - your general knowledge. Not measured; label it as such.',
      '',
      'Write the plan.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}

// ---------------------------------------------------------------------------------------------
// After the model answers
// ---------------------------------------------------------------------------------------------

export interface SanitizedAdStudioPlan {
  plan: AdStudioPlan;
  /** Citations removed because they named a source that had no data. */
  droppedCitations: number;
}

function clean(value: string): string {
  return value.trim();
}

function cleanList(values: readonly string[]): string[] {
  return values.map(clean).filter((value) => value.length > 0);
}

/**
 * Holds the model to the evidence it actually had: a citation of a source that was unavailable (or
 * of an unknown source) is dropped, and a recommendation left with no citation at all is flagged
 * `unsupported` rather than shown as if it rested on data. The landing page summary is cleared when
 * the page could not be read, whatever the model wrote there.
 */
export function sanitizeAdStudioPlan(plan: AdStudioPlan, available: readonly AdStudioEvidenceSource[]): SanitizedAdStudioPlan {
  const allowed = new Set<string>([...available, 'market']);
  let droppedCitations = 0;
  const recommendations = plan.recommendations.map((recommendation) => {
    const evidence = recommendation.evidence
      .filter((citation) => {
        const keep = allowed.has(citation.source);
        if (!keep) droppedCitations += 1;
        return keep;
      })
      .map((citation) => ({ source: citation.source, detail: clean(citation.detail) }));
    return {
      title: clean(recommendation.title),
      rationale: clean(recommendation.rationale),
      priority: recommendation.priority,
      evidence,
      ...(evidence.length === 0 ? { unsupported: true } : {}),
    };
  });
  return {
    droppedCitations,
    plan: {
      summary: clean(plan.summary),
      audience: clean(plan.audience),
      landingPageSummary: available.includes('landing_page') ? clean(plan.landingPageSummary) : '',
      messagingAngles: cleanList(plan.messagingAngles),
      keywordThemes: plan.keywordThemes
        .map((theme) => ({ theme: clean(theme.theme), keywords: cleanList(theme.keywords), evidence: clean(theme.evidence) }))
        .filter((theme) => theme.theme.length > 0),
      recommendations: recommendations.filter((recommendation) => recommendation.title.length > 0),
      marketNotes: cleanList(plan.marketNotes),
    },
  };
}

/** The part of a stored plan the script writer builds on (see `buildScriptPrompt`). */
export function planToScriptContext(plan: AdStudioPlan): AdStudioScriptContext {
  return {
    ...(plan.audience ? { audience: plan.audience } : {}),
    ...(plan.messagingAngles.length ? { messagingAngles: [...plan.messagingAngles] } : {}),
    ...(plan.keywordThemes.length
      ? { keywordThemes: plan.keywordThemes.map((theme) => (theme.keywords.length ? `${theme.theme} (${theme.keywords.join(', ')})` : theme.theme)) }
      : {}),
    ...(plan.landingPageSummary ? { landingPageSummary: plan.landingPageSummary } : {}),
  };
}
