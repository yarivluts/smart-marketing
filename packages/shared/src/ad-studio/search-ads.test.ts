import { describe, expect, it } from 'vitest';
import {
  buildSearchAdPrompt,
  cleanKeyword,
  cleanKeywordSeeds,
  defaultSearchTargeting,
  fitSearchAd,
  keywordFromIdea,
  normalizeSearchAd,
  normalizeSearchKeywords,
  searchAdDisplayUrl,
  searchAdIssues,
  searchKeywordsIssues,
  searchTargetingToGoogle,
  type AdStudioSearchKeyword,
} from './search-ads';

const BRIEF = { name: 'Sign fast', objective: 'Trial signups', productDescription: 'E-signatures for lawyers', landingPageUrl: 'https://www.easysign.example/lawyers', format: 'vertical' as const, language: 'en', targetSeconds: 30 };
// Hebrew as escapes (no Hebrew in code files).
const HEBREW = '\u05d7\u05ea\u05d9\u05de\u05d4 \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u05ea';

function keyword(text: string, overrides: Partial<AdStudioSearchKeyword> = {}): AdStudioSearchKeyword {
  return { text, matchType: 'PHRASE', avgMonthlySearches: 100, competition: 'LOW', lowTopOfPageBid: 1, highTopOfPageBid: 3, ...overrides };
}

describe('search ad keywords', () => {
  it('looks up Hebrew ads in Israel and English ads everywhere, as Google constants', () => {
    expect(defaultSearchTargeting('he')).toEqual({ country: 'IL', language: 'he' });
    expect(defaultSearchTargeting('en-US')).toEqual({ country: 'ALL', language: 'en' });
    expect(searchTargetingToGoogle({ country: 'IL', language: 'he' })).toEqual({ language: 'languageConstants/1027', geoTargetConstants: ['geoTargetConstants/2376'] });
    expect(searchTargetingToGoogle({ country: 'ALL', language: 'en' })).toEqual({ language: 'languageConstants/1000', geoTargetConstants: [] });
  });

  it('cleans keywords and seeds the way Google takes them', () => {
    expect(cleanKeyword('  E-Sign  "Contracts"!  ')).toBe('e-sign contracts');
    expect(cleanKeyword(`  ${HEBREW} `)).toBe(HEBREW);
    expect(cleanKeywordSeeds(['a', 'A', ' ', ...Array.from({ length: 12 }, (_, i) => `s${i}`)])).toHaveLength(10);
    expect(keywordFromIdea({ keyword: 'Sign PDF', avgMonthlySearches: 900, competition: 'HIGH', lowTopOfPageBid: 1.2, highTopOfPageBid: 4 })).toEqual({
      text: 'sign pdf',
      matchType: 'PHRASE',
      avgMonthlySearches: 900,
      competition: 'HIGH',
      lowTopOfPageBid: 1.2,
      highTopOfPageBid: 4,
    });
  });

  it('refuses bad targeting, over-long keywords, unknown match types, repeats and too many', () => {
    const ok = { targeting: { country: 'IL', language: 'he' }, keywords: [keyword('sign pdf'), keyword('sign pdf', { matchType: 'EXACT' })], negatives: ['free'] };
    expect(searchKeywordsIssues(ok)).toEqual([]);
    expect(searchKeywordsIssues({ ...ok, targeting: { country: 'XX', language: 'he' } })).toEqual([{ code: 'invalid_targeting' }]);
    expect(
      searchKeywordsIssues({
        ...ok,
        keywords: [keyword('x'.repeat(81)), keyword('a b c d e f g h i j k'), keyword('pdf', { matchType: 'FUZZY' as never }), keyword('sign pdf'), keyword('Sign PDF')],
      }),
    ).toEqual([
      { code: 'keyword_too_long', index: 1 },
      { code: 'keyword_too_many_words', index: 2 },
      { code: 'invalid_match_type', index: 3 },
      { code: 'duplicate_keyword', index: 5 },
    ]);
    expect(searchKeywordsIssues({ ...ok, keywords: Array.from({ length: 51 }, (_, i) => keyword(`k${i}`)) })[0]).toEqual({ code: 'too_many_keywords' });
    expect(normalizeSearchKeywords({ ...ok, keywords: [keyword(' Sign  PDF ', { avgMonthlySearches: Number.NaN })], negatives: ['Free', 'free', ' '] })).toEqual({
      targeting: { country: 'IL', language: 'he' },
      keywords: [keyword('sign pdf', { avgMonthlySearches: null })],
      negatives: ['free'],
    });
  });
});

describe('responsive search ads', () => {
  const AD = { headlines: ['Sign in seconds', 'E-signatures for lawyers', 'Start free today'], descriptions: ['Upload, send on WhatsApp, signed.', 'Legally binding signatures in a minute.'], path1: 'sign', path2: 'lawyers' };

  it('needs 3-15 unique headlines of 30 characters and 2-4 descriptions of 90, and short paths', () => {
    expect(searchAdIssues(AD)).toEqual([]);
    expect(searchAdIssues({ ...AD, headlines: ['One', 'one'], descriptions: ['x'.repeat(91)], path1: 'x'.repeat(16) })).toEqual([
      { code: 'too_few_headlines' },
      { code: 'duplicate_headline', index: 2 },
      { code: 'too_few_descriptions' },
      { code: 'description_too_long', index: 1 },
      { code: 'path_too_long' },
    ]);
    expect(searchAdIssues({ ...AD, headlines: [...AD.headlines, 'x'.repeat(31)] })).toEqual([{ code: 'headline_too_long', index: 4 }]);
  });

  it('drops blank lines, keeps paths URL-safe, and drops path2 without path1', () => {
    expect(normalizeSearchAd({ ...AD, headlines: [' Sign  in seconds ', ' ', ...AD.headlines.slice(1)], path1: 'free trial', path2: 'a/b' })).toEqual({ ...AD, path1: 'free-trial', path2: 'a-b' });
    expect(normalizeSearchAd({ ...AD, path1: '', path2: 'lawyers' }).path2).toBe('');
  });

  it('fits a model ad to the limits, without repeats, capped at 15 and 4', () => {
    const fitted = fitSearchAd({
      headlines: ['E-signatures for every lawyer in Israel today', 'Sign fast', 'sign fast', 42, ...Array.from({ length: 20 }, (_, i) => `Headline ${i}`)],
      descriptions: ['d1', 'd2', 'd3', 'd4', 'd5'],
      path1: 'sign now',
      path2: '',
    });
    expect(fitted.headlines[0]).toBe('E-signatures for every lawyer');
    expect(fitted.headlines).toHaveLength(15);
    expect(fitted.headlines.filter((headline) => headline.toLowerCase() === 'sign fast')).toHaveLength(1);
    expect(fitted.descriptions).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(fitted.path1).toBe('sign-now');
  });

  it('shows the landing page domain and the paths as the display URL', () => {
    expect(searchAdDisplayUrl(BRIEF.landingPageUrl, AD)).toBe('easysign.example/sign/lawyers');
    expect(searchAdDisplayUrl(null, { path1: '', path2: '' })).toBe('example.com');
  });

  it('asks for the RSA limits and the busiest keywords first', () => {
    const prompt = buildSearchAdPrompt(BRIEF, [keyword('sign pdf', { avgMonthlySearches: 10 }), keyword('e signature', { avgMonthlySearches: 5000 })], { audience: 'Small law firms' });
    expect(prompt.system).toContain('15 headlines of at most 30 characters');
    expect(prompt.system).toContain('Do not invent prices');
    expect(prompt.user).toContain('Keywords the ad bids on (monthly searches): e signature (5000), sign pdf (10)');
    expect(prompt.user).toContain('Audience: Small law firms');
    expect(buildSearchAdPrompt(BRIEF, []).user).toContain('No keywords chosen yet');
  });
});
