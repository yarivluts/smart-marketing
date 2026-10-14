// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, listAdStudioBriefs, listAdStudioUsage, getLatestAdStudioRun } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, resetAdStudioRuntime } from '@/lib/ad-studio/engine';
import { POST as fromSite } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/orgs/selected-environment', () => ({ resolveSelectedEnvironment: async () => ({ selected: null, environments: [] }) }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

const SITE: Record<string, string> = {
  'https://easysign.co.il/': '<html><head><title>EasySign</title></head><body><h1>Sign in 30 seconds</h1><a href="/pricing">Pricing</a></body></html>',
  'https://easysign.co.il/pricing': '<html><head><title>Pricing</title></head><body><p>Two documents free.</p></body></html>',
};
const siteFetch = vi.fn(async (url: string) => (SITE[url] ? new Response(SITE[url], { headers: { 'content-type': 'text/html' } }) : new Response('', { status: 404 })));

const ANALYSIS = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'he',
  offerings: [{ kind: 'product', name: 'Free plan', description: 'Two documents a month', forWhom: 'Small businesses', why: 'Free to try' }],
  audiences: [{ name: 'Law firms', description: 'Small firms', needs: 'Speed', why: 'Many contracts' }],
};

function fakeGemini(answer: unknown = ANALYSIS) {
  const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  getServerSessionMock.mockReset();
  configureAdStudioRuntime({ siteReader: { fetchImpl: siteFetch as unknown as typeof fetch, resolver: async () => ['93.184.215.14'] } });
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAdStudioRuntime();
  delete process.env.GEMINI_API_KEY;
});

const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

async function setup() {
  const email = `${unique('owner')}@example.com`;
  const session = { uid: unique('uid'), email, email_verified: true } as DecodedIdToken;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Studio Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue(session);
  return { orgId: organization.id, projectId: project.id, p: { params: Promise.resolve({ orgId: organization.id, projectId: project.id }) } };
}

describe('POST ad-studio/briefs/from-site', () => {
  it('writes the whole ad from the website and starts preparing it, waiting for the plan to be confirmed', async () => {
    fakeGemini();
    const ctx = await setup();
    const response = await fromSite(request({ siteUrl: 'easysign.co.il' }), ctx.p);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { brief: { id: string; name: string; language: string; landingPageUrl: string }; run: { status: string } };
    expect(body.brief).toMatchObject({ name: 'Free plan', language: 'he', landingPageUrl: 'https://easysign.co.il/' });
    expect(body.run.status).toBe('running');
    const run = await getLatestAdStudioRun(ctx.orgId, ctx.projectId, body.brief.id);
    // Defaults a beginner never has to set: a deep plan, square and portrait images, confirmed before rendering.
    expect(run?.options).toMatchObject({ plan: true, images: true, imageFormats: ['square', 'portrait'], confirmPlan: true });
    expect((await listAdStudioUsage(ctx.orgId, ctx.projectId)).map((row) => [row.kind, row.outcome])).toEqual([['site_analysis', 'succeeded']]);
  });

  it('says why a site cannot be used and creates nothing', async () => {
    fakeGemini({ ...ANALYSIS, offerings: [], audiences: [] });
    const ctx = await setup();
    const empty = await fromSite(request({ siteUrl: 'easysign.co.il' }), ctx.p);
    expect(empty.status).toBe(422);
    expect(await empty.json()).toEqual({ error: 'site', reason: 'nothing_found' });
    const unreachable = await fromSite(request({ siteUrl: 'https://easysign.co.il/missing' }), ctx.p);
    expect(await unreachable.json()).toEqual({ error: 'site', reason: 'site_http_error' });
    expect(await (await fromSite(request({ siteUrl: '' }), ctx.p)).json()).toEqual({ error: 'site', reason: 'invalid_url' });
    expect(await listAdStudioBriefs(ctx.orgId, ctx.projectId)).toHaveLength(0);
  });
});
