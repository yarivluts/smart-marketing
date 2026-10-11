import type { AdStudioPlan, AdStudioPlanSources } from '@growthos/shared';
import { connectFirestoreOrm, saveAdStudioPlan } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/** Same standalone ORM bootstrap `seed-ingest.ts` documents: Playwright specs run in plain Node, outside Next's bundler. */
function ensureConnected(): Promise<void> {
  if (!connectionPromise) {
    connectionPromise = connectFirestoreOrm({
      projectId: process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID,
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    });
  }
  return connectionPromise;
}

/**
 * A test fixture, not product data: the shape a deep analysis stores when the landing page, the
 * warehouse and Google Ads all answered, with market notes kept apart. Lets the e2e suite render the
 * whole planning panel without a live AI provider or paid API.
 */
export const E2E_PLAN_SOURCES: AdStudioPlanSources = {
  landingPage: { status: 'ok', url: 'https://example.com/lawyers', title: 'EasySign for lawyers', description: 'Sign contracts in 30 seconds', headings: ['Sign in 30 seconds', 'Built for law firms'], truncated: false, textLength: 1840 },
  results: {
    status: 'ok',
    environmentName: 'prod',
    since: '2026-06-30',
    days: 90,
    totals: { visitors: 4210, conversions: 187, conversionRate: 187 / 4210 },
    landingPages: [
      { key: 'https://example.com/lawyers', visitors: 2380, conversions: 131, conversionRate: 131 / 2380 },
      { key: 'https://example.com/pricing', visitors: 1120, conversions: 41, conversionRate: 41 / 1120 },
      { key: 'https://example.com/', visitors: 710, conversions: 15, conversionRate: 15 / 710 },
    ],
    campaigns: [
      { key: 'google-lawyers-search', visitors: 1900, conversions: 112, conversionRate: 112 / 1900 },
      { key: 'meta-firms-retargeting', visitors: 1300, conversions: 52, conversionRate: 52 / 1300 },
      { key: 'meta-spring-video', visitors: 1010, conversions: 23, conversionRate: 23 / 1010 },
    ],
  },
  campaigns: {
    status: 'ok',
    campaigns: [
      { label: 'Lawyers search', platform: 'google_ads', status: 'enabled', dailyBudgetUsd: 60, ads: [{ headline: 'Sign in 30 seconds', primaryText: '', description: 'Legally binding e-signatures' }] },
      { label: 'Firms retargeting', platform: 'meta_ads', status: 'enabled', dailyBudgetUsd: 35, ads: [] },
      { label: 'Spring video', platform: 'meta_ads', status: 'paused', dailyBudgetUsd: 20, ads: [] },
    ],
  },
  keywords: {
    status: 'ok',
    seedKeywords: ['Sign in 30 seconds', 'e-signatures for lawyers'],
    seedUrl: 'https://example.com/lawyers',
    language: 'languageConstants/1000',
    geoTargets: [],
    ideas: [
      { keyword: 'electronic signature', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBid: 2.1, highTopOfPageBid: 9.4 },
      { keyword: 'e signature for lawyers', avgMonthlySearches: 880, competition: 'MEDIUM', lowTopOfPageBid: 3.2, highTopOfPageBid: 11.5 },
      { keyword: 'sign legal documents online', avgMonthlySearches: 590, competition: 'LOW', lowTopOfPageBid: null, highTopOfPageBid: null },
    ],
  },
};

export const E2E_PLAN: AdStudioPlan = {
  summary: 'Lead with the 30-second signing claim the landing page already opens on, aimed at small firms searching for electronic signatures.',
  audience: 'Solo lawyers and small law firms who sign client documents every day',
  landingPageSummary: 'Mobile e-signing for law firms: send, sign and store contracts in 30 seconds.',
  messagingAngles: ['Signed in 30 seconds', 'Sign from anywhere', 'Legally binding'],
  keywordThemes: [
    { theme: 'Electronic signature', keywords: ['electronic signature', 'e signature for lawyers'], evidence: 'Keyword volumes: 12,100 and 880 monthly searches' },
    { theme: 'Legal documents online', keywords: ['sign legal documents online'], evidence: 'Keyword volumes: 590 monthly searches' },
  ],
  recommendations: [
    { title: 'Open on the 30-second claim', rationale: 'The landing page H1 leads with it and /lawyers converts best.', priority: 'high', evidence: [{ source: 'landing_page', detail: 'H1: Sign in 30 seconds' }, { source: 'results', detail: '/lawyers converts at 5.5%' }] },
    { title: 'Target the electronic signature search', rationale: 'It has by far the most monthly searches.', priority: 'medium', evidence: [{ source: 'keywords', detail: 'electronic signature: 12,100 searches a month' }] },
    { title: 'Add captions to every scene', rationale: 'Feeds autoplay muted.', priority: 'low', evidence: [{ source: 'market', detail: 'General short-form practice' }] },
  ],
  marketNotes: ['Short-form feeds autoplay muted, so on-screen text carries the message.'],
};

/** Stores {@link E2E_PLAN} on a brief through `saveAdStudioPlan` - the service the plan route itself writes with. */
export async function seedAdStudioPlan(params: { organizationId: string; projectId: string; briefId: string }): Promise<void> {
  await ensureConnected();
  await saveAdStudioPlan({
    ...params,
    plan: E2E_PLAN,
    sources: E2E_PLAN_SOURCES,
    generatedBy: { provider: 'gemini', model: 'gemini-3.8-flash', generated_at: new Date().toISOString() },
  });
}
