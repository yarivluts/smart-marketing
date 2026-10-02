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
  requestResourceAttachment,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { POST as createBrief } from './briefs/route';
import { GET as audiences } from './briefs/[briefId]/audiences/route';
import { GET as interests } from './briefs/[briefId]/audiences/interests/route';
import { POST as estimate } from './briefs/[briefId]/audiences/estimate/route';
import { GET as performance } from './briefs/[briefId]/audiences/performance/route';
import { PUT as saveTargeting } from './briefs/[briefId]/targeting/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

beforeEach(() => getServerSessionMock.mockReset());
afterEach(() => vi.unstubAllGlobals());

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function request(method: string, body?: unknown, url = 'http://localhost/api/test'): NextRequest {
  return new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
}

async function setup(withMeta: boolean) {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Audience Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);
  const orgId = organization.id;
  const projectId = project.id;
  if (withMeta) {
    const credential = await createSharedCredential({ organizationId: orgId, name: 'Meta', provider: 'meta_ads', availableScopes: ['ads'], createdByUserId: owner.id });
    await setSharedCredentialSecret({ organizationId: orgId, credentialId: credential.id, secret: JSON.stringify({ accessToken: 'meta-token', adAccountId: '99', pageId: 'p1' }), kms: getServerKmsProvider(), actorId: owner.id });
    const attachment = await requestResourceAttachment({ organizationId: orgId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['ads'] });
    await decideResourceAttachment({ organizationId: orgId, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
  }
  const created = await createBrief(request('POST', { name: 'Sign fast', objective: 'Signups', productDescription: 'E-signatures', landingPageUrl: '', format: 'vertical', language: 'he', targetSeconds: 30 }), { params: Promise.resolve({ orgId, projectId }) });
  const briefId = ((await created.json()) as { brief: { id: string } }).brief.id;
  return { orgId, projectId, briefId, p: { params: Promise.resolve({ orgId, projectId, briefId }) } };
}

function stubGraph(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.host !== 'graph.facebook.com') throw new Error(`Unexpected request to ${url}`);
    const key = url.pathname.replace('/v25.0/', '');
    if (!(key in routes)) throw new Error(`Unexpected Graph path ${key}`);
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const TARGETING = {
  countries: ['il'],
  ageMin: 25,
  ageMax: 54,
  genders: ['female'],
  customAudiences: [{ id: '2385', name: 'Website visitors', sizeLower: 1000, sizeUpper: 1200 }],
  interests: [{ id: '6003107902433', name: 'Law', sizeLower: 100, sizeUpper: 200 }],
};

describe('Ad Studio audiences', () => {
  it('without a Meta account, every lookup says why instead of failing', async () => {
    const ctx = await setup(false);
    const fetchMock = stubGraph({});
    expect(await (await audiences(request('GET'), ctx.p)).json()).toEqual({ result: { status: 'unavailable', reason: 'no_meta_credential' } });
    expect(await (await performance(request('GET'), ctx.p)).json()).toEqual({ result: { status: 'unavailable', reason: 'no_meta_credential' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the account's audiences, Hebrew-named interests, a reach estimate and its past results", async () => {
    const ctx = await setup(true);
    const fetchMock = stubGraph({
      'act_99/customaudiences': { data: [{ id: '2385', name: 'Website visitors', subtype: 'WEBSITE', approximate_count_lower_bound: 1000, approximate_count_upper_bound: 1200 }] },
      'act_99/saved_audiences': { data: [] },
      search: { data: [{ id: '6003107902433', name: 'Law', audience_size_lower_bound: 100, audience_size_upper_bound: 200 }] },
      'act_99/delivery_estimate': { data: [{ estimate_mau_lower_bound: 120000, estimate_mau_upper_bound: 140000, estimate_ready: true }] },
      'act_99/insights': { data: [{ country: 'IL', spend: '12.5', impressions: '100', clicks: '5', actions: [{ action_type: 'link_click', value: '4' }] }] },
    });
    expect(((await (await audiences(request('GET'), ctx.p)).json()) as { result: { data: unknown[] } }).result.data).toHaveLength(1);
    const found = (await (await interests(request('GET', undefined, 'http://localhost/api/test?q=law'), ctx.p)).json()) as { result: { data: { id: string }[] } };
    expect(found.result.data[0].id).toBe('6003107902433');
    const searchUrl = new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/search'))?.[0]));
    expect(searchUrl.searchParams.get('locale')).toBe('he_IL');

    const reach = await estimate(request('POST', { targeting: TARGETING }), ctx.p);
    expect(await reach.json()).toEqual({ result: { status: 'ok', data: { monthlyLower: 120000, monthlyUpper: 140000, ready: true } } });
    const reachUrl = new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('delivery_estimate'))?.[0]));
    expect(JSON.parse(reachUrl.searchParams.get('targeting_spec') as string)).toMatchObject({ geo_locations: { countries: ['IL'] }, age_min: 25, genders: [2], custom_audiences: [{ id: '2385' }] });
    expect((await estimate(request('POST', { targeting: { ...TARGETING, ageMin: 70 } }), ctx.p)).status).toBe(400);

    const past = await performance(request('GET', undefined, 'http://localhost/api/test?breakdown=country'), ctx.p);
    expect(await past.json()).toEqual({ result: { status: 'ok', data: [{ segment: ['IL'], spend: 12.5, impressions: 100, clicks: 5, linkClicks: 4, conversions: 0 }] } });
    expect((await performance(request('GET', undefined, 'http://localhost/api/test?breakdown=weather'), ctx.p)).status).toBe(400);
  });

  it('saves the targeting cleaned, refuses broken targeting with every rule, and clears it', async () => {
    const ctx = await setup(false);
    const saved = await saveTargeting(request('PUT', { targeting: TARGETING }), ctx.p);
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { brief: { metaTargeting: { countries: string[] } } }).brief.metaTargeting.countries).toEqual(['IL']);
    const bad = await saveTargeting(request('PUT', { targeting: { ...TARGETING, countries: [], ageMin: 60, ageMax: 30 } }), ctx.p);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_targeting', issues: [{ code: 'no_countries' }, { code: 'invalid_age' }] });
    await saveTargeting(request('PUT', { targeting: null }), ctx.p);
    expect((await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId)).meta_targeting).toBeNull();
  });
});
