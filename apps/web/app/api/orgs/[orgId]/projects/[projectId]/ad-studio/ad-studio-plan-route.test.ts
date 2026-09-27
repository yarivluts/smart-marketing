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
  setAdStudioSettings,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { POST as createBrief } from './briefs/route';
import { POST as planBrief } from './briefs/[briefId]/plan/route';
import { POST as generateScript } from './briefs/[briefId]/script/generate/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));
// The plan route reads the project's environment-picker cookie (KAN-196) through `next/headers`,
// which only works inside a real request scope. No cookie: the project's prod environment.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

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

async function setup() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Plan Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const session = { uid, email } as DecodedIdToken;
  getServerSessionMock.mockResolvedValue(session);
  return { owner, orgId: organization.id, projectId: project.id };
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
}

/** A public IP literal, so the SSRF guard needs no DNS lookup in the test. */
const LANDING_URL = 'https://93.184.215.14/lawyers';
const LANDING_HTML =
  '<html><head><title>EasySign for lawyers</title><meta name="description" content="Sign contracts in 30 seconds"></head><body><main><h1>Sign in 30 seconds</h1><p>Send and sign contracts from your phone.</p></main></body></html>';

const BRIEF = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers, contract templates',
  landingPageUrl: LANDING_URL,
  format: 'vertical',
  language: 'en',
  targetSeconds: 30,
};

const MODEL_PLAN = {
  summary: 'Lead with the 30-second claim.',
  audience: 'Solo lawyers and small firms',
  landingPageSummary: 'Mobile e-signing for law firms, signed in 30 seconds.',
  messagingAngles: ['Speed', 'Sign from anywhere'],
  keywordThemes: [{ theme: 'E-signature', keywords: ['electronic signature'], evidence: 'keywords' }],
  recommendations: [
    { title: 'Open on the 30-second claim', rationale: 'The page H1 leads with it', priority: 'high', evidence: [{ source: 'landing_page', detail: 'H1: Sign in 30 seconds' }] },
    { title: 'Target the busiest search', rationale: 'Highest volume', priority: 'medium', evidence: [{ source: 'keywords', detail: 'electronic signature 12100/month' }] },
    { title: 'Reuse winning copy', rationale: 'Worked before', priority: 'low', evidence: [{ source: 'results', detail: 'invented conversion rate' }] },
  ],
  marketNotes: ['Short-form feeds autoplay muted, so captions matter.'],
};

interface Routes {
  gemini: string[];
  landing?: () => Response;
  googleAds?: () => Response;
}

/** One stub for every outbound call the route makes, routed by host; anything else fails the test. */
function stubNetwork(routes: Routes) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: routes.gemini.shift() ?? '{}' }] } }] }), { status: 200 });
    }
    if (url.startsWith('https://93.184.215.14/') && routes.landing) return routes.landing();
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 3600 }), { status: 200 });
    if (url.startsWith('https://googleads.googleapis.com/v25/') && routes.googleAds) return routes.googleAds();
    throw new Error(`Unexpected request to ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calledHosts(fetchMock: ReturnType<typeof stubNetwork>): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)).host);
}

async function newBrief(orgId: string, projectId: string, body: Record<string, unknown> = BRIEF): Promise<string> {
  const response = await createBrief(request('POST', body), { params: Promise.resolve({ orgId, projectId }) });
  expect(response.status).toBe(201);
  return ((await response.json()) as { brief: { id: string } }).brief.id;
}

interface PlanResponse {
  brief: {
    status: string;
    plan: typeof MODEL_PLAN & { recommendations: { title: string; evidence: { source: string }[]; unsupported?: boolean }[] };
    planSources: Record<string, { status: string; reason?: string; ideas?: unknown[]; title?: string }>;
    planGeneratedBy: { provider: string };
  };
}

describe('POST .../ad-studio/briefs/[briefId]/plan', () => {
  it('reads the landing page, reports every missing source by reason, drops citations of missing sources, and logs one plan call', async () => {
    const { orgId, projectId } = await setup();
    const briefId = await newBrief(orgId, projectId);
    const fetchMock = stubNetwork({ gemini: [JSON.stringify(MODEL_PLAN)], landing: () => new Response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }) });

    const response = await planBrief(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(response.status).toBe(200);
    const { brief } = (await response.json()) as PlanResponse;

    expect(brief.status).toBe('planned');
    expect(brief.planGeneratedBy.provider).toBe('gemini');
    expect(brief.planSources.landingPage).toMatchObject({ status: 'ok', title: 'EasySign for lawyers', headings: ['Sign in 30 seconds'] });
    expect(brief.planSources.results).toEqual({ status: 'unavailable', reason: 'warehouse_not_configured' });
    expect(brief.planSources.campaigns).toEqual({ status: 'unavailable', reason: 'no_campaigns' });
    expect(brief.planSources.keywords).toEqual({ status: 'unavailable', reason: 'no_google_ads_credential' });

    // Keywords and results were unavailable: those citations are dropped and the results-only one is flagged.
    const [first, second, third] = brief.plan.recommendations;
    expect(first.evidence).toEqual([{ source: 'landing_page', detail: 'H1: Sign in 30 seconds' }]);
    expect(second).toMatchObject({ evidence: [], unsupported: true });
    expect(third).toMatchObject({ evidence: [], unsupported: true });
    expect(brief.plan.marketNotes).toEqual(MODEL_PLAN.marketNotes);

    // The model saw the page and was told which sources had nothing.
    const geminiBody = JSON.parse(String((fetchMock.mock.calls.find(([input]) => String(input).includes('generativelanguage')) as unknown as [string, RequestInit])[1].body));
    const userText = geminiBody.contents[0].parts[0].text as string;
    expect(userText).toContain('Headings: Sign in 30 seconds');
    expect(userText).toContain('### Evidence [keywords] - UNAVAILABLE (reason: no_google_ads_credential)');
    expect(calledHosts(fetchMock)).toEqual(['93.184.215.14', 'generativelanguage.googleapis.com']);

    const usage = await listAdStudioUsage(orgId, projectId);
    expect(usage.filter((row) => row.kind === 'plan')).toHaveLength(1);
    expect(usage[0]).toMatchObject({ kind: 'plan', outcome: 'succeeded', brief_id: briefId });
  });

  it('with an attached Google Ads credential, looks up v25 keyword ideas and keeps their measured volumes', async () => {
    const { owner, orgId, projectId } = await setup();
    const credential = await createSharedCredential({ organizationId: orgId, name: 'Google Ads', provider: 'google_ads', availableScopes: ['account'], createdByUserId: owner.id });
    await setSharedCredentialSecret({
      organizationId: orgId,
      credentialId: credential.id,
      secret: JSON.stringify({ developerToken: 'dev', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', customerId: '123-456-7890' }),
      kms: getServerKmsProvider(),
      actorId: owner.id,
    });
    const attachment = await requestResourceAttachment({ organizationId: orgId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['account'] });
    await decideResourceAttachment({ organizationId: orgId, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });

    const briefId = await newBrief(orgId, projectId, { ...BRIEF, language: 'he' });
    const script = JSON.stringify({ title: 'Ad', scenes: [{ durationSeconds: 5, visualPrompt: 'A lawyer signs on a phone', voiceover: '', onScreenText: '' }] });
    const fetchMock = stubNetwork({
      gemini: [JSON.stringify(MODEL_PLAN), script],
      landing: () => new Response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }),
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

    const response = await planBrief(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(response.status).toBe(200);
    const { brief } = (await response.json()) as PlanResponse;
    expect(brief.planSources.keywords).toMatchObject({
      status: 'ok',
      seedUrl: LANDING_URL,
      language: 'languageConstants/1027',
      geoTargets: ['geoTargetConstants/2376'],
      ideas: [
        { keyword: 'electronic signature', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBid: 2.1, highTopOfPageBid: 9.4 },
        { keyword: 'sign pdf', avgMonthlySearches: 880, competition: 'LOW', lowTopOfPageBid: null, highTopOfPageBid: null },
      ],
    });
    expect(brief.plan.recommendations[1].evidence).toEqual([{ source: 'keywords', detail: 'electronic signature 12100/month' }]);

    const adsCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith('https://googleads.googleapis.com/')) as unknown as [string, RequestInit];
    expect(adsCall[0]).toBe('https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordIdeas');
    expect(JSON.parse(String(adsCall[1].body))).toMatchObject({ language: 'languageConstants/1027', geoTargetConstants: ['geoTargetConstants/2376'], keywordAndUrlSeed: { url: LANDING_URL } });

    // Backed by Google Ads data, the keyword themes reach the script writer as what people search for.
    expect((await generateScript(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) })).status).toBe(200);
    const geminiCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('generativelanguage')) as unknown as [string, RequestInit][];
    expect(JSON.parse(String(geminiCalls[1][1].body)).contents[0].parts[0].text).toContain('What people search for: E-signature (electronic signature)');
  });

  it('the script generator then builds on the stored plan', async () => {
    const { orgId, projectId } = await setup();
    const briefId = await newBrief(orgId, projectId);
    const script = JSON.stringify({ title: 'Ad', scenes: [{ durationSeconds: 5, visualPrompt: 'A lawyer signs on a phone', voiceover: '', onScreenText: '' }] });
    const fetchMock = stubNetwork({ gemini: [JSON.stringify(MODEL_PLAN), script], landing: () => new Response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }) });
    const params = { params: Promise.resolve({ orgId, projectId, briefId }) };
    expect((await planBrief(request('POST'), params)).status).toBe(200);
    expect((await generateScript(request('POST'), params)).status).toBe(200);

    const geminiCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('generativelanguage')) as unknown as [string, RequestInit][];
    const scriptPrompt = JSON.parse(String(geminiCalls[1][1].body)).contents[0].parts[0].text as string;
    expect(scriptPrompt).toContain('Context from the planning stage:');
    expect(scriptPrompt).toContain('Audience: Solo lawyers and small firms');
    expect(scriptPrompt).toContain('Messaging angles to build on: Speed; Sign from anywhere');
    // No Google Ads data behind this plan: its keyword themes are the model's grouping, not searches.
    expect(scriptPrompt).not.toContain('What people search for');
    expect(scriptPrompt).toContain('Landing page summary: Mobile e-signing for law firms, signed in 30 seconds.');
    expect((await getAdStudioBrief(orgId, projectId, briefId)).status).toBe('scripted');
  });

  it('a spent daily limit refuses before any evidence is gathered; no provider key says not_configured', async () => {
    const { owner, orgId, projectId } = await setup();
    const briefId = await newBrief(orgId, projectId);
    await setAdStudioSettings({ organizationId: orgId, projectId, dailyTextGenerations: 0, dailyVideoSeconds: 0, actorId: owner.id });
    const fetchMock = stubNetwork({ gemini: [], landing: () => new Response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }) });
    const refused = await planBrief(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: 'quota_exceeded', limitKind: 'text' });
    expect(fetchMock).not.toHaveBeenCalled();

    delete process.env.GEMINI_API_KEY;
    const unconfigured = await planBrief(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: 'provider_failed', code: 'not_configured' });
  });

  it('a model answer that does not match the plan schema is invalid_output and logged as failed', async () => {
    const { orgId, projectId } = await setup();
    const briefId = await newBrief(orgId, projectId, { ...BRIEF, landingPageUrl: '' });
    stubNetwork({ gemini: [JSON.stringify({ summary: 'only this' })] });
    const response = await planBrief(request('POST'), { params: Promise.resolve({ orgId, projectId, briefId }) });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'provider_failed', code: 'invalid_output' });
    expect((await listAdStudioUsage(orgId, projectId))[0]).toMatchObject({ kind: 'plan', outcome: 'failed', failure_reason: 'invalid_output' });
    expect((await getAdStudioBrief(orgId, projectId, briefId)).plan).toBeNull();
  });
});
