// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  listAdStudioUsage,
  requestResourceAttachment,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { POST as createBrief } from './briefs/route';
import { POST as research } from './briefs/[briefId]/keywords/research/route';
import { PUT as saveKeywords } from './briefs/[briefId]/keywords/route';
import { PUT as saveSearchAd } from './briefs/[briefId]/search-ad/route';
import { POST as writeSearchAd } from './briefs/[briefId]/search-ad/generate/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
}

const BRIEF = { name: 'Sign in 30 seconds', objective: 'Trial signups', productDescription: 'E-signatures for lawyers', landingPageUrl: 'https://easysign.example/lawyers', format: 'vertical', language: 'en', targetSeconds: 30 };

async function setup() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Search Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);
  const orgId = organization.id;
  const projectId = project.id;
  const created = await createBrief(request('POST', BRIEF), { params: Promise.resolve({ orgId, projectId }) });
  const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
  return { owner, orgId, projectId, briefId, p: { params: Promise.resolve({ orgId, projectId, briefId }) } };
}

async function attachGoogleAds(orgId: string, projectId: string, ownerId: string): Promise<void> {
  const credential = await createSharedCredential({ organizationId: orgId, name: 'Google Ads', provider: 'google_ads', availableScopes: ['account'], createdByUserId: ownerId });
  await setSharedCredentialSecret({
    organizationId: orgId,
    credentialId: credential.id,
    secret: JSON.stringify({ developerToken: 'dev', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', customerId: '123-456-7890' }),
    kms: getServerKmsProvider(),
    actorId: ownerId,
  });
  const attachment = await requestResourceAttachment({ organizationId: orgId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: ownerId, scopeSelection: ['account'] });
  await decideResourceAttachment({ organizationId: orgId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
}

function stubNetwork(routes: { gemini?: string[]; googleAds?: () => Response }) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: routes.gemini?.shift() ?? '{}' }] } }] }), { status: 200 });
    }
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 3600 }), { status: 200 });
    if (url.startsWith('https://googleads.googleapis.com/v25/') && routes.googleAds) return routes.googleAds();
    throw new Error(`Unexpected request to ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const KEYWORDS = {
  targeting: { country: 'IL', language: 'he' },
  keywords: [
    { text: 'Electronic Signature', matchType: 'PHRASE', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBid: 2.1, highTopOfPageBid: 9.4 },
    { text: 'sign pdf', matchType: 'EXACT', avgMonthlySearches: 880, competition: 'LOW', lowTopOfPageBid: null, highTopOfPageBid: null },
  ],
  negatives: ['free', 'Free', 'jobs'],
};

describe('Ad Studio search ads', () => {
  it('says why keyword research is unavailable without a Google Ads account, and refuses bad targeting', async () => {
    const ctx = await setup();
    const fetchMock = stubNetwork({});
    const response = await research(request('POST', { seeds: ['e signature'], targeting: { country: 'IL', language: 'he' } }), ctx.p);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ research: { status: 'unavailable', reason: 'no_google_ads_credential' } });
    expect((await research(request('POST', { seeds: ['x'], targeting: { country: 'ZZ', language: 'he' } }), ctx.p)).status).toBe(400);
    expect(await (await research(request('POST', { seeds: [' '], targeting: { country: 'IL', language: 'he' } }), ctx.p)).json()).toEqual({ research: { status: 'unavailable', reason: 'no_seeds' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with an attached Google Ads account, researches in the chosen country and language, busiest first', async () => {
    const ctx = await setup();
    await attachGoogleAds(ctx.orgId, ctx.projectId, ctx.owner.id);
    const fetchMock = stubNetwork({
      googleAds: () =>
        new Response(
          JSON.stringify({
            results: [
              { text: 'sign pdf', keywordIdeaMetrics: { avgMonthlySearches: '880', competition: 'LOW' } },
              { text: 'electronic signature', keywordIdeaMetrics: { avgMonthlySearches: '12100', competition: 'HIGH', lowTopOfPageBidMicros: '2100000', highTopOfPageBidMicros: '9400000' } },
            ],
          }),
          { status: 200 },
        ),
    });
    const response = await research(request('POST', { seeds: ['E-Signature', 'e-signature'], url: BRIEF.landingPageUrl, targeting: { country: 'US', language: 'en' } }), ctx.p);
    const { research: result } = (await response.json()) as { research: { status: string; ideas: unknown[]; seeds: string[] } };
    expect(result).toMatchObject({
      status: 'ok',
      seeds: ['e-signature'],
      ideas: [
        { keyword: 'electronic signature', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBid: 2.1, highTopOfPageBid: 9.4 },
        { keyword: 'sign pdf', avgMonthlySearches: 880, competition: 'LOW', lowTopOfPageBid: null, highTopOfPageBid: null },
      ],
    });
    const adsCall = fetchMock.mock.calls.find(([input]) => String(input).includes('generateKeywordIdeas')) as unknown as [string, RequestInit];
    expect(JSON.parse(String(adsCall[1].body))).toMatchObject({
      language: 'languageConstants/1000',
      geoTargetConstants: ['geoTargetConstants/2840'],
      keywordAndUrlSeed: { url: BRIEF.landingPageUrl, keywords: ['e-signature'] },
    });
    // A Google API call, not an AI one: nothing is metered.
    expect(await listAdStudioUsage(ctx.orgId, ctx.projectId)).toEqual([]);
  });

  it('saves the chosen keywords cleaned, refuses broken ones with every rule, and clears them', async () => {
    const ctx = await setup();
    const saved = await saveKeywords(request('PUT', { keywords: KEYWORDS }), ctx.p);
    expect(saved.status).toBe(200);
    const { brief } = (await saved.json()) as { brief: { searchKeywords: { keywords: { text: string }[]; negatives: string[] } } };
    expect(brief.searchKeywords.keywords.map((keyword) => keyword.text)).toEqual(['electronic signature', 'sign pdf']);
    expect(brief.searchKeywords.negatives).toEqual(['free', 'jobs']);

    const bad = await saveKeywords(request('PUT', { keywords: { ...KEYWORDS, keywords: [{ ...KEYWORDS.keywords[0], matchType: 'FUZZY' }] } }), ctx.p);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_search', issues: [{ code: 'invalid_match_type', index: 1 }] });
    expect((await saveKeywords(request('PUT', { keywords: 'nope' }), ctx.p)).status).toBe(400);
    await saveKeywords(request('PUT', { keywords: null }), ctx.p);
    expect((await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId)).search_keywords).toBeNull();
  });

  it('the AI writes a search ad for the chosen keywords, fitted to Google limits; a person edits it within them', async () => {
    const ctx = await setup();
    await saveKeywords(request('PUT', { keywords: KEYWORDS }), ctx.p);
    const fetchMock = stubNetwork({
      gemini: [
        JSON.stringify({
          headlines: ['Electronic signature in 30 seconds for lawyers', 'Sign PDF online', 'sign pdf online', 'Start free trial'],
          descriptions: ['Send a contract on WhatsApp and get it signed in a minute.', 'Legally binding e-signatures for law firms.'],
          path1: 'e signature',
          path2: 'lawyers',
        }),
      ],
    });
    const written = await writeSearchAd(request('POST'), ctx.p);
    expect(written.status).toBe(200);
    const { brief } = (await written.json()) as { brief: { searchAd: { headlines: string[]; descriptions: string[]; path1: string } } };
    expect(brief.searchAd.headlines).toEqual(['Electronic signature in 30', 'Sign PDF online', 'Start free trial']);
    expect(brief.searchAd.path1).toBe('e-signature');
    const prompt = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).contents[0].parts[0].text as string;
    expect(prompt).toContain('Keywords the ad bids on (monthly searches): electronic signature (12100), sign pdf (880)');
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId))[0]).toMatchObject({ kind: 'search_ad', outcome: 'succeeded' });

    const edited = await saveSearchAd(request('PUT', { ad: { ...brief.searchAd, headlines: [...brief.searchAd.headlines, 'x'.repeat(31)] } }), ctx.p);
    expect(edited.status).toBe(400);
    expect(await edited.json()).toEqual({ error: 'invalid_search', issues: [{ code: 'headline_too_long', index: 4 }] });
    const ok = await saveSearchAd(request('PUT', { ad: { ...brief.searchAd, headlines: [...brief.searchAd.headlines, 'Signed by lunch'] } }), ctx.p);
    expect(((await ok.json()) as { brief: { searchAd: { headlines: string[] } } }).brief.searchAd.headlines).toHaveLength(4);
  });
});
