import { describe, expect, it } from 'vitest';
import type { AdStudioBriefInput } from './prompts';
import {
  availableEvidenceSources,
  buildKeywordSeeds,
  buildPlanPrompt,
  conversionRate,
  keywordTargetingForLanguage,
  planToScriptContext,
  sanitizeAdStudioPlan,
  toAdStudioPlanSources,
  type AdStudioEvidence,
  type AdStudioPlan,
} from './planning';

const BRIEF: AdStudioBriefInput = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers, contract templates. Mobile signing app for small firms that sign every day',
  landingPageUrl: 'https://example.com/lawyers',
  format: 'vertical',
  language: 'en',
  targetSeconds: 30,
};

const EVIDENCE: AdStudioEvidence = {
  landingPage: {
    status: 'ok',
    url: 'https://example.com/lawyers',
    title: 'EasySign for lawyers',
    description: 'Sign contracts in 30 seconds',
    headings: ['Sign in 30 seconds'],
    text: 'Send, sign and store contracts from your phone.',
    truncated: false,
  },
  results: {
    status: 'ok',
    environmentName: 'prod',
    since: '2026-06-29',
    days: 90,
    totals: { visitors: 1000, conversions: 50, conversionRate: 0.05 },
    landingPages: [{ key: '/lawyers', visitors: 800, conversions: 48, conversionRate: 0.06 }],
    campaigns: [{ key: 'cmp-1', visitors: 0, conversions: 2, conversionRate: null }],
  },
  campaigns: { status: 'unavailable', reason: 'no_campaigns' },
  keywords: {
    status: 'ok',
    seedKeywords: ['e-signatures for lawyers'],
    seedUrl: 'https://example.com/lawyers',
    language: 'languageConstants/1000',
    geoTargets: [],
    ideas: [{ keyword: 'electronic signature', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBid: 2.1, highTopOfPageBid: 9.4 }],
  },
};

const PLAN: AdStudioPlan = {
  summary: ' Lead with speed. ',
  audience: 'Solo lawyers',
  landingPageSummary: 'Mobile e-signing for law firms',
  messagingAngles: ['Speed', ' ', 'Legal validity'],
  keywordThemes: [{ theme: 'E-signature', keywords: ['electronic signature', ' '], evidence: 'keywords: 12100 monthly searches' }],
  recommendations: [
    { title: 'Open on the 30-second claim', rationale: 'The page leads with it', priority: 'high', evidence: [{ source: 'landing_page', detail: 'H1 says Sign in 30 seconds' }] },
    {
      title: 'Reuse the best campaign copy',
      rationale: 'It worked before',
      priority: 'medium',
      evidence: [
        { source: 'campaigns', detail: 'campaign X' },
        { source: 'results', detail: '/lawyers converts at 6.0%' },
      ],
    },
    { title: 'Show a phone', rationale: 'Invented', priority: 'low', evidence: [{ source: 'campaigns', detail: 'ad copy' }] },
    { title: 'Use captions', rationale: 'Most feeds play muted', priority: 'low', evidence: [{ source: 'market', detail: 'general practice' }] },
  ],
  marketNotes: ['Short-form feeds autoplay muted.'],
};

describe('conversionRate and available sources', () => {
  it('divides only when there are visitors', () => {
    expect(conversionRate(200, 10)).toBe(0.05);
    expect(conversionRate(0, 3)).toBeNull();
  });

  it('lists the sources that returned data', () => {
    expect(availableEvidenceSources(EVIDENCE)).toEqual(['landing_page', 'results', 'keywords']);
  });
});

describe('buildKeywordSeeds', () => {
  it('takes short phrases from the page headings first, then the product and the ad name, deduped and capped', () => {
    const seeds = buildKeywordSeeds(BRIEF, ['E-signatures for lawyers', 'A heading that is far too long to be a search term at all']);
    expect(seeds[0]).toBe('E-signatures for lawyers');
    expect(seeds).toContain('contract templates');
    expect(seeds).toContain('Sign in 30 seconds');
    expect(seeds.filter((seed) => seed.toLowerCase() === 'e-signatures for lawyers')).toHaveLength(1);
    expect(seeds.some((seed) => seed.split(' ').length > 5)).toBe(false);
    expect(seeds.length).toBeLessThanOrEqual(6);
  });

  it('gives nothing when there are no short phrases', () => {
    expect(buildKeywordSeeds({ name: 'x', productDescription: 'one two three four five six seven' })).toEqual([]);
  });
});

describe('keywordTargetingForLanguage', () => {
  it('Hebrew targets Hebrew in Israel, English targets English everywhere, anything else is unfiltered', () => {
    expect(keywordTargetingForLanguage('he')).toEqual({ language: 'languageConstants/1027', geoTargetConstants: ['geoTargetConstants/2376'] });
    expect(keywordTargetingForLanguage('en-US')).toEqual({ language: 'languageConstants/1000', geoTargetConstants: [] });
    expect(keywordTargetingForLanguage('fr')).toEqual({ language: null, geoTargetConstants: [] });
  });
});

describe('buildPlanPrompt', () => {
  it('marks each source, carries the measured figures verbatim, and tells the model not to cite unavailable ones', () => {
    const prompt = buildPlanPrompt(BRIEF, EVIDENCE);
    expect(prompt.system).toContain('Do not invent facts');
    expect(prompt.system).toContain('cite it as market and also list it in marketNotes');
    expect(prompt.user).toContain('### Evidence [landing_page] - available');
    expect(prompt.user).toContain('Headings: Sign in 30 seconds');
    expect(prompt.user).toContain('- /lawyers: visitors 800, conversions 48, conversion rate 6.0%');
    expect(prompt.user).toContain('- cmp-1: visitors 0, conversions 2, conversion rate n/a');
    expect(prompt.user).toContain('### Evidence [campaigns] - UNAVAILABLE (reason: no_campaigns). Do not cite it.');
    expect(prompt.user).toContain('- electronic signature: avg monthly searches 12100, competition HIGH, top-of-page bid 2.1-9.4 (account currency)');
    expect(prompt.user).toContain('### [market] - your general knowledge. Not measured');
  });

  it('describes an unreadable landing page without inventing its content', () => {
    const prompt = buildPlanPrompt(BRIEF, { ...EVIDENCE, landingPage: { status: 'unavailable', reason: 'timeout' } });
    expect(prompt.user).toContain('### Evidence [landing_page] - UNAVAILABLE (reason: timeout)');
    expect(prompt.user).not.toContain('Visible text');
  });
});

describe('sanitizeAdStudioPlan', () => {
  it('drops citations of unavailable sources, flags a recommendation left with none, and trims the lists', () => {
    const { plan, droppedCitations } = sanitizeAdStudioPlan(PLAN, availableEvidenceSources(EVIDENCE));
    expect(droppedCitations).toBe(2);
    expect(plan.recommendations[1].evidence).toEqual([{ source: 'results', detail: '/lawyers converts at 6.0%' }]);
    expect(plan.recommendations[1].unsupported).toBeUndefined();
    expect(plan.recommendations[2]).toMatchObject({ title: 'Show a phone', evidence: [], unsupported: true });
    expect(plan.recommendations[3].evidence).toEqual([{ source: 'market', detail: 'general practice' }]);
    expect(plan.summary).toBe('Lead with speed.');
    expect(plan.messagingAngles).toEqual(['Speed', 'Legal validity']);
    expect(plan.keywordThemes[0].keywords).toEqual(['electronic signature']);
  });

  it('clears the landing page summary when the page could not be read', () => {
    expect(sanitizeAdStudioPlan(PLAN, ['results']).plan.landingPageSummary).toBe('');
  });
});

describe('toAdStudioPlanSources and planToScriptContext', () => {
  it('stores the evidence without the page text, keeping its length', () => {
    const sources = toAdStudioPlanSources(EVIDENCE);
    expect(sources.landingPage).toMatchObject({ status: 'ok', title: 'EasySign for lawyers', textLength: EVIDENCE.landingPage.status === 'ok' ? EVIDENCE.landingPage.text.length : 0 });
    expect(sources.landingPage).not.toHaveProperty('text');
    expect(sources.campaigns).toEqual({ status: 'unavailable', reason: 'no_campaigns' });
  });

  it('hands the script writer the audience, angles, keyword themes and landing page summary', () => {
    expect(planToScriptContext(sanitizeAdStudioPlan(PLAN, ['landing_page']).plan)).toEqual({
      audience: 'Solo lawyers',
      messagingAngles: ['Speed', 'Legal validity'],
      keywordThemes: ['E-signature (electronic signature)'],
      landingPageSummary: 'Mobile e-signing for law firms',
    });
    expect(planToScriptContext({ ...PLAN, audience: '', messagingAngles: [], keywordThemes: [], landingPageSummary: '' })).toEqual({});
  });

  it('passes keyword themes on as search terms only when the keyword source had Google Ads data', () => {
    const plan = sanitizeAdStudioPlan(PLAN, availableEvidenceSources(EVIDENCE)).plan;
    expect(planToScriptContext(plan, toAdStudioPlanSources(EVIDENCE)).keywordThemes).toEqual(['E-signature (electronic signature)']);
    expect(planToScriptContext(plan, { keywords: { status: 'unavailable', reason: 'no_google_ads_credential' } })).not.toHaveProperty('keywordThemes');
  });
});
