import { languageName, type AdStudioBriefInput, type AdStudioPrompt, type AdStudioScriptContext } from './prompts';
import type { AdStudioKeywordCompetition, AdStudioKeywordIdea, AdStudioKeywordTargeting } from './planning';

/**
 * Search ads: the keywords an ad bids on, researched with Google's own monthly volumes, and the
 * responsive search ad (RSA) shown for them - up to 15 headlines and 4 descriptions that Google
 * combines. Pure: the routes, the engine, the UI and the MCP tools share these rules. The limits
 * are Google's own (RSA: headlines 30 characters, descriptions 90, display-URL paths 15; a keyword
 * at most 80 characters and 10 words).
 */

export const AD_STUDIO_RSA_HEADLINE_MAX = 30;
export const AD_STUDIO_RSA_DESCRIPTION_MAX = 90;
export const AD_STUDIO_RSA_PATH_MAX = 15;
export const AD_STUDIO_RSA_HEADLINES = { min: 3, max: 15 } as const;
export const AD_STUDIO_RSA_DESCRIPTIONS = { min: 2, max: 4 } as const;

export const AD_STUDIO_KEYWORD_MAX_CHARS = 80;
export const AD_STUDIO_KEYWORD_MAX_WORDS = 10;
export const AD_STUDIO_MAX_KEYWORDS = 50;
export const AD_STUDIO_MAX_NEGATIVE_KEYWORDS = 50;
export const AD_STUDIO_MAX_KEYWORD_SEEDS = 10;

export const AD_STUDIO_MATCH_TYPES = ['BROAD', 'PHRASE', 'EXACT'] as const;
export type AdStudioMatchType = (typeof AD_STUDIO_MATCH_TYPES)[number];

/** Where keyword volumes are looked up: Google geo target constants by country, `ALL` for everywhere. */
export const AD_STUDIO_SEARCH_COUNTRIES: Record<string, number | null> = {
  ALL: null,
  IL: 2376,
  US: 2840,
  GB: 2826,
  CA: 2124,
  AU: 2036,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  NL: 2528,
  IN: 2356,
};
/** Google language constants for the languages keyword volumes are looked up in. */
export const AD_STUDIO_SEARCH_LANGUAGES: Record<string, number> = { he: 1027, en: 1000, ar: 1019, ru: 1031, es: 1003, fr: 1002, de: 1001, it: 1004 };

export interface AdStudioSearchTargeting {
  /** A key of {@link AD_STUDIO_SEARCH_COUNTRIES}. */
  country: string;
  /** A key of {@link AD_STUDIO_SEARCH_LANGUAGES}. */
  language: string;
}

/** A keyword the ad bids on, with the volumes it was chosen by (null when Google gave none). */
export interface AdStudioSearchKeyword {
  text: string;
  matchType: AdStudioMatchType;
  avgMonthlySearches: number | null;
  competition: AdStudioKeywordCompetition | null;
  lowTopOfPageBid: number | null;
  highTopOfPageBid: number | null;
}

export interface AdStudioSearchKeywords {
  targeting: AdStudioSearchTargeting;
  keywords: AdStudioSearchKeyword[];
  /** Searches the ad must not show for, as phrases (added as phrase-match negatives). */
  negatives: string[];
}

/** A responsive search ad. */
export interface AdStudioSearchAd {
  headlines: string[];
  descriptions: string[];
  /** The two optional parts after the domain in the display URL: example.com/path1/path2. */
  path1: string;
  path2: string;
}

function oneLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** The default lookup for an ad language: Hebrew in Israel, English everywhere, otherwise everywhere in that language. */
export function defaultSearchTargeting(language: string): AdStudioSearchTargeting {
  const base = language.toLowerCase().split('-')[0];
  const lang = base === 'iw' ? 'he' : base;
  return { country: lang === 'he' ? 'IL' : 'ALL', language: AD_STUDIO_SEARCH_LANGUAGES[lang] ? lang : 'en' };
}

/** The Google Ads constants for a lookup. */
export function searchTargetingToGoogle(targeting: AdStudioSearchTargeting): AdStudioKeywordTargeting {
  const geo = AD_STUDIO_SEARCH_COUNTRIES[targeting.country];
  const language = AD_STUDIO_SEARCH_LANGUAGES[targeting.language];
  return { language: language ? `languageConstants/${language}` : null, geoTargetConstants: geo ? [`geoTargetConstants/${geo}`] : [] };
}

export function isSearchTargeting(value: unknown): value is AdStudioSearchTargeting {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.country === 'string' && raw.country in AD_STUDIO_SEARCH_COUNTRIES && typeof raw.language === 'string' && raw.language in AD_STUDIO_SEARCH_LANGUAGES;
}

/** A keyword as Google takes it: one line, lower case, without the symbols Google refuses in keywords. */
export function cleanKeyword(value: unknown): string {
  return oneLine(value)
    .replace(/[!@%,*=^<>;`~{}\\|[\]"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

/** Seed phrases for a lookup: cleaned, without duplicates, at most ten. */
export function cleanKeywordSeeds(seeds: readonly unknown[]): string[] {
  return [...new Set(seeds.map(cleanKeyword).filter(Boolean))].slice(0, AD_STUDIO_MAX_KEYWORD_SEEDS);
}

/** A keyword idea from the lookup, as a keyword to bid on (phrase match by default). */
export function keywordFromIdea(idea: AdStudioKeywordIdea, matchType: AdStudioMatchType = 'PHRASE'): AdStudioSearchKeyword {
  return {
    text: cleanKeyword(idea.keyword),
    matchType,
    avgMonthlySearches: idea.avgMonthlySearches,
    competition: idea.competition,
    lowTopOfPageBid: idea.lowTopOfPageBid,
    highTopOfPageBid: idea.highTopOfPageBid,
  };
}

export type AdStudioSearchIssueCode =
  | 'invalid_targeting'
  | 'too_many_keywords'
  | 'keyword_empty'
  | 'keyword_too_long'
  | 'keyword_too_many_words'
  | 'invalid_match_type'
  | 'duplicate_keyword'
  | 'too_many_negatives'
  | 'too_few_headlines'
  | 'too_many_headlines'
  | 'headline_too_long'
  | 'duplicate_headline'
  | 'too_few_descriptions'
  | 'too_many_descriptions'
  | 'description_too_long'
  | 'path_too_long';

export interface AdStudioSearchIssue {
  code: AdStudioSearchIssueCode;
  /** 1-based position of the keyword, headline or description, when the issue is about one. */
  index?: number;
}

function keywordIssue(text: string): AdStudioSearchIssueCode | null {
  if (!text) return 'keyword_empty';
  if (text.length > AD_STUDIO_KEYWORD_MAX_CHARS) return 'keyword_too_long';
  if (text.split(' ').length > AD_STUDIO_KEYWORD_MAX_WORDS) return 'keyword_too_many_words';
  return null;
}

/** The rules a keyword list breaks; empty when it can be saved. */
export function searchKeywordsIssues(value: AdStudioSearchKeywords): AdStudioSearchIssue[] {
  const issues: AdStudioSearchIssue[] = [];
  if (!isSearchTargeting(value.targeting)) issues.push({ code: 'invalid_targeting' });
  if (value.keywords.length > AD_STUDIO_MAX_KEYWORDS) issues.push({ code: 'too_many_keywords' });
  const seen = new Set<string>();
  value.keywords.forEach((keyword, position) => {
    const text = cleanKeyword(keyword.text);
    const issue = keywordIssue(text);
    if (issue) issues.push({ code: issue, index: position + 1 });
    if (!(AD_STUDIO_MATCH_TYPES as readonly string[]).includes(keyword.matchType)) issues.push({ code: 'invalid_match_type', index: position + 1 });
    const key = `${text}|${keyword.matchType}`;
    if (text && seen.has(key)) issues.push({ code: 'duplicate_keyword', index: position + 1 });
    seen.add(key);
  });
  if (value.negatives.length > AD_STUDIO_MAX_NEGATIVE_KEYWORDS) issues.push({ code: 'too_many_negatives' });
  value.negatives.forEach((negative, position) => {
    const issue = keywordIssue(cleanKeyword(negative));
    if (issue) issues.push({ code: issue, index: position + 1 });
  });
  return issues;
}

/** A keyword list as stored: cleaned text, numbers or null, empty negatives and repeats dropped. */
export function normalizeSearchKeywords(value: AdStudioSearchKeywords): AdStudioSearchKeywords {
  const number = (raw: unknown) => (typeof raw === 'number' && Number.isFinite(raw) ? raw : null);
  return {
    targeting: { country: value.targeting.country, language: value.targeting.language },
    keywords: value.keywords.map((keyword) => ({
      text: cleanKeyword(keyword.text),
      matchType: keyword.matchType,
      avgMonthlySearches: number(keyword.avgMonthlySearches),
      competition: keyword.competition === 'LOW' || keyword.competition === 'MEDIUM' || keyword.competition === 'HIGH' ? keyword.competition : null,
      lowTopOfPageBid: number(keyword.lowTopOfPageBid),
      highTopOfPageBid: number(keyword.highTopOfPageBid),
    })),
    negatives: [...new Set(value.negatives.map(cleanKeyword).filter(Boolean))],
  };
}

/** The rules a search ad breaks; empty when it can be saved (and published). */
export function searchAdIssues(ad: AdStudioSearchAd): AdStudioSearchIssue[] {
  const issues: AdStudioSearchIssue[] = [];
  const headlines = ad.headlines.map(oneLine).filter(Boolean);
  const descriptions = ad.descriptions.map(oneLine).filter(Boolean);
  if (headlines.length < AD_STUDIO_RSA_HEADLINES.min) issues.push({ code: 'too_few_headlines' });
  if (headlines.length > AD_STUDIO_RSA_HEADLINES.max) issues.push({ code: 'too_many_headlines' });
  const seen = new Set<string>();
  headlines.forEach((headline, position) => {
    if (headline.length > AD_STUDIO_RSA_HEADLINE_MAX) issues.push({ code: 'headline_too_long', index: position + 1 });
    if (seen.has(headline.toLocaleLowerCase())) issues.push({ code: 'duplicate_headline', index: position + 1 });
    seen.add(headline.toLocaleLowerCase());
  });
  if (descriptions.length < AD_STUDIO_RSA_DESCRIPTIONS.min) issues.push({ code: 'too_few_descriptions' });
  if (descriptions.length > AD_STUDIO_RSA_DESCRIPTIONS.max) issues.push({ code: 'too_many_descriptions' });
  descriptions.forEach((description, position) => {
    if (description.length > AD_STUDIO_RSA_DESCRIPTION_MAX) issues.push({ code: 'description_too_long', index: position + 1 });
  });
  if (oneLine(ad.path1).length > AD_STUDIO_RSA_PATH_MAX || oneLine(ad.path2).length > AD_STUDIO_RSA_PATH_MAX) issues.push({ code: 'path_too_long' });
  return issues;
}

/** A search ad as stored: one line per field, blank lines dropped; paths without slashes or spaces. */
export function normalizeSearchAd(ad: AdStudioSearchAd): AdStudioSearchAd {
  const path = (value: unknown) => oneLine(value).replace(/[\s/]+/g, '-');
  return {
    headlines: ad.headlines.map(oneLine).filter(Boolean),
    descriptions: ad.descriptions.map(oneLine).filter(Boolean),
    path1: path(ad.path1),
    path2: path(ad.path1) ? path(ad.path2) : '',
  };
}

/** Cuts a phrase to `max` characters at a word boundary when one is near. */
function fitText(value: string, max: number): string {
  const text = oneLine(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // The cut already ends a word: keep it whole.
  if (text[max] === ' ') return cut.replace(/[\s,;:-]+$/, '');
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, '');
}

/** Makes a model's search ad legal instead of trusting its character counts: fitted, unique, capped. */
export function fitSearchAd(raw: { headlines?: unknown; descriptions?: unknown; path1?: unknown; path2?: unknown }): AdStudioSearchAd {
  const list = (value: unknown, max: number, count: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of Array.isArray(value) ? value : []) {
      const text = fitText(typeof item === 'string' ? item : '', max);
      if (!text || seen.has(text.toLocaleLowerCase())) continue;
      seen.add(text.toLocaleLowerCase());
      out.push(text);
      if (out.length === count) break;
    }
    return out;
  };
  return normalizeSearchAd({
    headlines: list(raw.headlines, AD_STUDIO_RSA_HEADLINE_MAX, AD_STUDIO_RSA_HEADLINES.max),
    descriptions: list(raw.descriptions, AD_STUDIO_RSA_DESCRIPTION_MAX, AD_STUDIO_RSA_DESCRIPTIONS.max),
    path1: fitText(oneLine(raw.path1), AD_STUDIO_RSA_PATH_MAX),
    path2: fitText(oneLine(raw.path2), AD_STUDIO_RSA_PATH_MAX),
  });
}

/** The display URL of a search ad: the landing page's domain and the two paths. */
export function searchAdDisplayUrl(landingPageUrl: string | null | undefined, ad: Pick<AdStudioSearchAd, 'path1' | 'path2'>): string {
  let domain = '';
  try {
    domain = landingPageUrl ? new URL(landingPageUrl).hostname.replace(/^www\./, '') : '';
  } catch {
    domain = '';
  }
  return [domain || 'example.com', oneLine(ad.path1), oneLine(ad.path2)].filter(Boolean).join('/');
}

/** The instructions for writing a responsive search ad from the brief, the plan and the chosen keywords. */
export function buildSearchAdPrompt(brief: AdStudioBriefInput, keywords: readonly Pick<AdStudioSearchKeyword, 'text' | 'avgMonthlySearches'>[], context: AdStudioScriptContext = {}): AdStudioPrompt {
  const contextLines = [
    context.landingPageSummary ? `Landing page summary: ${context.landingPageSummary}` : null,
    context.audience ? `Audience: ${context.audience}` : null,
    context.messagingAngles?.length ? `Messaging angles: ${context.messagingAngles.join('; ')}` : null,
    context.keywordThemes?.length ? `Keyword themes: ${context.keywordThemes.join('; ')}` : null,
  ].filter((line): line is string => line !== null);
  const topKeywords = [...keywords].sort((a, b) => (b.avgMonthlySearches ?? -1) - (a.avgMonthlySearches ?? -1)).slice(0, 20);
  return {
    system: [
      'You write Google responsive search ads.',
      'Rules:',
      `- Write ${AD_STUDIO_RSA_HEADLINES.max} headlines of at most ${AD_STUDIO_RSA_HEADLINE_MAX} characters each and ${AD_STUDIO_RSA_DESCRIPTIONS.max} descriptions of at most ${AD_STUDIO_RSA_DESCRIPTION_MAX} characters each, in the ad language. Count characters carefully; shorter is fine.`,
      '- Google mixes headlines and descriptions in any order, so each one must make sense on its own and none may repeat another.',
      '- Put the main keywords in several headlines, word for word where it reads naturally: ads that echo the search get clicked.',
      '- Mix: the benefit, the product name, features, a reason to act now, and a call to action. Write numbers as digits.',
      '- Do not invent prices, discounts, statistics, awards, guarantees or testimonials. No exclamation mark in headlines; no ALL CAPS words.',
      `- path1 and path2 extend the display URL (at most ${AD_STUDIO_RSA_PATH_MAX} characters each, one or two words, no spaces): e.g. "sign" and "free-trial". Use the ad language when it reads naturally.`,
    ].join('\n'),
    user: [
      `Ad name: ${brief.name}`,
      `Objective: ${brief.objective}`,
      `Product: ${brief.productDescription}`,
      brief.landingPageUrl ? `Landing page: ${brief.landingPageUrl}` : null,
      `Ad language: ${languageName(brief.language)}`,
      ...(contextLines.length ? ['', 'Context:', ...contextLines] : []),
      '',
      topKeywords.length ? `Keywords the ad bids on (monthly searches): ${topKeywords.map((keyword) => `${keyword.text}${keyword.avgMonthlySearches !== null ? ` (${keyword.avgMonthlySearches})` : ''}`).join(', ')}` : 'No keywords chosen yet: write for the searches someone looking for this product would make.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}
