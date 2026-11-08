// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  acquireGrowthPilotLease,
  AdStudioExportModel,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideGrowthProposal,
  decideResourceAttachment,
  ensureUserForFirebaseSession,
  finishGrowthTargetAds,
  getAdStudioBrief,
  getGrowthTarget,
  inviteMemberToOrganization,
  linkGrowthTargetAds,
  listAuditLogEntriesForOrg,
  listGrowthProposals,
  markGrowthAdsPublished,
  requestResourceAttachment,
  saveGrowthAudienceProposal,
  saveGrowthPilotAnalysis,
  saveGrowthPublishProposal,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
  startGrowthPilot,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import type { GrowthPilotPageData } from '@/lib/growth-pilot/view';
import { POST as decide } from './proposals/[proposalId]/route';
import { POST as changeTarget } from './targets/[targetId]/route';
import { DELETE as resetSettings, GET as readSettings, PUT as saveSettings } from './settings/route';
import { DELETE as resetPlatform, GET as readPlatform, PUT as savePlatform } from '../../../../../operator/growth-pilots/settings/route';

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
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROWTHOS_PLATFORM_OPERATORS;
});

const unique = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;
const request = (method: string, body?: unknown) => new NextRequest('http://localhost/api/test', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
const ANALYSIS = { businessName: 'EasySign', summary: 'Signatures.', language: 'en', offerings: [{ kind: 'service' as const, name: 'Pro plan', description: '20 documents', forWhom: 'Offices', why: 'Daily' }], audiences: [] };
const PLAN = { summary: 'Older offices', targeting: { countries: ['IL'], ageMin: 40, ageMax: 65, genders: [], customAudiences: [], interests: [] }, unresolvedInterests: [], reach: null, meta: 'ok' };

/** Meta's Graph API as the live-ads calls reach it: answers by method and path, and remembers every call. */
function stubGraph(routes: Record<string, unknown>) {
  const calls: { method: string; path: string; body: URLSearchParams | null }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.host !== 'graph.facebook.com') throw new Error(`Unexpected request to ${url}`);
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace('/v25.0/', '');
    calls.push({ method, path, body: typeof init?.body === 'string' ? new URLSearchParams(init.body) : null });
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected Graph call ${key}`);
    const answer = routes[key];
    return answer instanceof Response ? answer : new Response(JSON.stringify(answer), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** A project with a connected Meta account and a target whose two ads are on Meta, still switched off. */
async function publishedTarget() {
  const uid = unique('uid');
  const email = `${unique('owner')}@example.com`;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Live Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const orgId = organization.id;
  const projectId = project.id;
  const credential = await createSharedCredential({ organizationId: orgId, name: 'Meta', provider: 'meta_ads', availableScopes: ['ads'], createdByUserId: owner.id });
  await setSharedCredentialSecret({ organizationId: orgId, credentialId: credential.id, secret: JSON.stringify({ accessToken: 'meta-token', adAccountId: '99', pageId: 'p1' }), kms: getServerKmsProvider(), actorId: owner.id });
  const attachment = await requestResourceAttachment({ organizationId: orgId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['ads'] });
  await decideResourceAttachment({ organizationId: orgId, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
  // Changing live ads writes to the account: the connection must allow it, as for publishing.
  await setResourceAttachmentWriteTier({ organizationId: orgId, attachmentId: attachment.id, tier: 'manage', actorId: owner.id });

  const scope = { organizationId: orgId, projectId, actorId: owner.id };
  const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
  const token = await acquireGrowthPilotLease(pilot);
  await saveGrowthPilotAnalysis({ pilot, token: token!, analysis: ANALYSIS, pages: [], drafts: [{ kind: 'service', name: 'Pro plan', description: '20 documents', audience: 'Offices', reason: 'Daily' }], generatedBy: { provider: 'gemini', model: 'm' } });
  const [idea] = await listGrowthProposals(orgId, projectId, pilot.id);
  await decideGrowthProposal({ ...scope, proposalId: idea.id, decision: 'approve' });
  const targetId = idea.target_id!;
  const brief = await createAdStudioBrief({ organizationId: orgId, projectId, input: { name: 'Pro', objective: 'Trials', productDescription: 'E-sign', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 15 }, createdByUserId: owner.id });
  await linkGrowthTargetAds({ ...scope, targetId, briefId: brief.id, runId: 'r1' });
  await finishGrowthTargetAds({ ...scope, targetId, previewImageIds: ['i1', 'i2'] });
  const ads = (await listGrowthProposals(orgId, projectId, pilot.id)).find((row) => row.kind === 'ads')!;
  await decideGrowthProposal({ ...scope, proposalId: ads.id, decision: 'approve' });
  const audience = await saveGrowthAudienceProposal({ ...scope, targetId, plan: { ...PLAN, targeting: { ...PLAN.targeting, ageMin: 25 } } });
  await decideGrowthProposal({ ...scope, proposalId: audience.id, decision: 'approve' });

  const exportIds: string[] = [];
  for (const adId of ['2390', '2391']) {
    const row = new AdStudioExportModel();
    row.organization_id = orgId;
    row.project_id = projectId;
    row.brief_id = brief.id;
    row.media_kind = 'image';
    row.result_kind = 'ad';
    row.destination = 'meta';
    row.attachment_id = attachment.id;
    row.title = 'EasySign - Pro plan';
    row.description = 'Sign fast';
    row.status = 'done';
    row.platform_refs = { ad_account_id: '99', campaign_id: '2385', ad_set_id: '2386', ad_id: adId, creative_id: `cr${adId}` };
    row.requested_by = owner.id;
    row.requested_on = new Date().toISOString();
    row.setPathParams({ organization_id: orgId, project_id: projectId });
    await row.save();
    exportIds.push(row.id);
  }
  const publish = await saveGrowthPublishProposal({ ...scope, targetId, plan: { destination: 'meta', imageIds: ['i1', 'i2'], dailyBudget: 20, linkUrl: 'https://a.co/', campaignName: 'EasySign - Pro plan', countries: ['IL'] } });
  await markGrowthAdsPublished({ ...scope, proposalId: publish.id, exportIds, dailyBudget: 20, metaRefs: { ad_account_id: '99', campaign_id: '2385', ad_set_ids: ['2386'], ad_ids: ['2390', '2391'] }, currency: null });

  const signInOwner = () => getServerSessionMock.mockResolvedValue({ uid, email } as DecodedIdToken);
  signInOwner();
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId, projectId, ...extra }) }) as never;
  return { orgId, projectId, owner, briefId: brief.id, targetId, pilotId: pilot.id, p, signInOwner };
}

async function signInAsEditor(orgId: string, projectId: string, ownerId: string) {
  const email = `${unique('member')}@example.com`;
  const invitation = await inviteMemberToOrganization({ organizationId: orgId, email, role: 'editor', invitedByUserId: ownerId, projectId });
  const session = { uid: unique('uid'), email, email_verified: true } as DecodedIdToken;
  const member = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId: orgId, membershipId: invitation.id, userId: member.id, callerEmailVerified: true });
  getServerSessionMock.mockResolvedValue(session);
}

describe('changing the daily budget of live ads', () => {
  it('sets it on the campaign (where publishing put it), shows it with the currency, and records it', async () => {
    const ctx = await publishedTarget();
    const calls = stubGraph({ 'GET 2385': { id: '2385', status: 'PAUSED', daily_budget: '2000' }, 'GET act_99': { currency: 'ILS' }, 'POST 2385': { success: true } });
    const response = await changeTarget(request('POST', { action: 'budget', dailyBudget: 45 }), ctx.p({ targetId: ctx.targetId }));
    expect(response.status).toBe(200);
    const data = (await response.json()) as GrowthPilotPageData;
    expect(data.targets[0]).toMatchObject({ dailyBudget: 45, budgetCurrency: 'ILS', adsManagerUrl: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=99&selected_campaign_ids=2385' });
    const mutation = calls.filter((call) => call.method === 'POST');
    expect(mutation).toHaveLength(1);
    expect(mutation[0].path).toBe('2385');
    expect(mutation[0].body?.get('daily_budget')).toBe('4500');
    expect(data.activity.find((row) => row.kind === 'budget_changed')).toMatchObject({ count: 45, detail: 'ILS', targetId: ctx.targetId });
    expect((await listAuditLogEntriesForOrg(ctx.orgId)).map((entry) => entry.action)).toEqual(expect.arrayContaining(['growth_pilot.budget_changed', 'ad_studio.daily_budget_changed']));
  }, 60_000);

  it('refuses a budget out of range, a person without the publish permission, and a target with nothing live - before calling Meta', async () => {
    const ctx = await publishedTarget();
    const calls = stubGraph({});
    for (const dailyBudget of [0, 0.5, 100_001, '45']) {
      const response = await changeTarget(request('POST', { action: 'budget', dailyBudget }), ctx.p({ targetId: ctx.targetId }));
      expect([response.status, ((await response.json()) as { error: string }).error]).toEqual([400, 'invalid_budget']);
    }
    // An unknown target has nothing live to change.
    const missing = await changeTarget(request('POST', { action: 'budget', dailyBudget: 45 }), ctx.p({ targetId: 'missing' }));
    expect(missing.status).toBe(404);
    await signInAsEditor(ctx.orgId, ctx.projectId, ctx.owner.id);
    expect([403, 404]).toContain((await changeTarget(request('POST', { action: 'budget', dailyBudget: 45 }), ctx.p({ targetId: ctx.targetId }))).status);
    expect(calls).toEqual([]);
    expect((await getGrowthTarget(ctx.orgId, ctx.projectId, ctx.targetId)).daily_budget).toBe(20);
  }, 60_000);

  it('says why when Meta refuses, keeps the old budget, and records the failure', async () => {
    const ctx = await publishedTarget();
    stubGraph({ 'GET 2385': { id: '2385', status: 'PAUSED', daily_budget: '2000' }, 'GET act_99': { currency: 'ILS' }, 'POST 2385': new Response('{"error":{"code":100,"message":"Invalid"}}', { status: 400 }) });
    const response = await changeTarget(request('POST', { action: 'budget', dailyBudget: 45 }), ctx.p({ targetId: ctx.targetId }));
    expect([response.status, await response.json()]).toEqual([502, { error: 'platform_failed', code: 'rejected' }]);
    expect((await getGrowthTarget(ctx.orgId, ctx.projectId, ctx.targetId)).daily_budget).toBe(20);
    expect((await listAuditLogEntriesForOrg(ctx.orgId)).map((entry) => entry.action)).toContain('growth_pilot.budget_change_failed');
  }, 60_000);
});

describe('a new audience for live ads', () => {
  it('needs the publish permission; approving updates the live ad set targeting in place and keeps it on the brief', async () => {
    const ctx = await publishedTarget();
    const live = await saveGrowthAudienceProposal({ organizationId: ctx.orgId, projectId: ctx.projectId, targetId: ctx.targetId, plan: PLAN });
    expect(live.applies_to_live).toBe(true);
    const calls = stubGraph({ 'POST 2386': { success: true }, 'GET 2386': { id: '2386', status: 'PAUSED', targeting: { geo_locations: { countries: ['IL'] }, age_min: 40, age_max: 65 } } });

    await signInAsEditor(ctx.orgId, ctx.projectId, ctx.owner.id);
    expect([403, 404]).toContain((await decide(request('POST', { action: 'approve' }), ctx.p({ proposalId: live.id }))).status);
    expect(calls).toEqual([]);

    ctx.signInOwner();
    const response = await decide(request('POST', { action: 'approve' }), ctx.p({ proposalId: live.id }));
    expect(response.status).toBe(200);
    const data = (await response.json()) as GrowthPilotPageData;
    expect(data.proposals.find((proposal) => proposal.id === live.id)?.status).toBe('approved');
    expect(data.targets[0]).toMatchObject({ audienceStatus: 'approved', publishStatus: 'published' });
    const update = calls.find((call) => call.method === 'POST' && call.path === '2386');
    expect(JSON.parse(update?.body?.get('targeting') ?? '{}')).toMatchObject({ geo_locations: { countries: ['IL'] }, age_min: 40, age_max: 65, targeting_automation: { advantage_audience: 0 } });
    // Nothing was created or switched on.
    expect(calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual(['2386']);
    expect((await getAdStudioBrief(ctx.orgId, ctx.projectId, ctx.briefId)).meta_targeting).toMatchObject({ ageMin: 40, ageMax: 65 });
    expect(data.activity.find((row) => row.kind === 'audience_applied')).toMatchObject({ detail: 'updated', targetId: ctx.targetId });
  }, 60_000);

  it('when Meta refuses to edit the ad set, moves the ads to a new paused ad set and points the target at it', async () => {
    const ctx = await publishedTarget();
    const live = await saveGrowthAudienceProposal({ organizationId: ctx.orgId, projectId: ctx.projectId, targetId: ctx.targetId, plan: PLAN });
    let ad = 0;
    const calls = stubGraph({
      'POST 2386': new Response('{"error":{"code":100,"message":"Invalid parameter"}}', { status: 400 }),
      'GET 2386': { id: '2386', status: 'PAUSED', targeting: { geo_locations: { countries: ['IL'] }, age_min: 25, age_max: 65 } },
      'POST act_99/adsets': { id: '2400' },
      get 'POST act_99/ads'() {
        ad += 1;
        return { id: `250${ad}` };
      },
    });
    const response = await decide(request('POST', { action: 'approve' }), ctx.p({ proposalId: live.id }));
    expect(response.status).toBe(200);
    const created = calls.filter((call) => call.method === 'POST' && call.path === 'act_99/ads');
    expect(created.map((call) => [call.body?.get('adset_id'), call.body?.get('status'), JSON.parse(call.body?.get('creative') ?? '{}').creative_id])).toEqual([
      ['2400', 'PAUSED', 'cr2390'],
      ['2400', 'PAUSED', 'cr2391'],
    ]);
    // The old ad set was off, so nothing is turned on.
    expect(calls.some((call) => call.body?.get('status') === 'ACTIVE')).toBe(false);
    expect((await getGrowthTarget(ctx.orgId, ctx.projectId, ctx.targetId)).meta_refs).toMatchObject({ ad_set_ids: ['2400'], ad_ids: ['2501', '2502'] });
  }, 60_000);
});

describe('suggestion threshold settings', () => {
  it('lets project admins read, set and reset the project values, checked and audited', async () => {
    const ctx = await publishedTarget();
    const read = (await (await readSettings(request('GET'), ctx.p())).json()) as { settings: { overrides: object; effective: { lowCtr: number } } };
    expect(read.settings.overrides).toEqual({});
    const saved = await saveSettings(request('PUT', { thresholds: { lowCtr: 0.02, noClicksAfterDays: 4 } }), ctx.p());
    expect(((await saved.json()) as { settings: { effective: { lowCtr: number; noClicksAfterDays: number } } }).settings.effective).toMatchObject({ lowCtr: 0.02, noClicksAfterDays: 4 });
    const bad = await saveSettings(request('PUT', { thresholds: { lowCtr: 5 } }), ctx.p());
    expect([bad.status, await bad.json()]).toEqual([400, { error: 'invalid_thresholds', invalid: ['lowCtr'] }]);
    expect((await saveSettings(request('PUT', {}), ctx.p())).status).toBe(400);
    const reset = (await (await resetSettings(request('DELETE'), ctx.p())).json()) as { settings: { overrides: object } };
    expect(reset.settings.overrides).toEqual({});
    expect((await listAuditLogEntriesForOrg(ctx.orgId)).map((entry) => entry.action)).toEqual(expect.arrayContaining(['growth_pilot.thresholds_changed', 'growth_pilot.thresholds_reset']));

    await signInAsEditor(ctx.orgId, ctx.projectId, ctx.owner.id);
    expect([403, 404]).toContain((await saveSettings(request('PUT', { thresholds: { lowCtr: 0.03 } }), ctx.p())).status);
  }, 60_000);

  it('lets only platform operators set the defaults every project starts from', async () => {
    getServerSessionMock.mockResolvedValue(null);
    expect((await readPlatform()).status).toBe(404);
    const email = `${unique('operator')}@example.com`;
    const session = { uid: unique('uid'), email, email_verified: true } as DecodedIdToken;
    await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
    getServerSessionMock.mockResolvedValue(session);
    expect((await savePlatform(request('PUT', { thresholds: { lowCtr: 0.01 } }))).status).toBe(404);
    process.env.GROWTHOS_PLATFORM_OPERATORS = email;
    const saved = (await (await savePlatform(request('PUT', { thresholds: { lowCtr: 0.01 } }))).json()) as { settings: { overrides: object; history: { by: string }[] } };
    expect(saved.settings.overrides).toEqual({ lowCtr: 0.01 });
    expect(saved.settings.history.at(-1)?.by).toBeTruthy();
    expect((await savePlatform(request('PUT', { thresholds: { lowCtr: -1 } }))).status).toBe(400);
    const reset = (await (await resetPlatform()).json()) as { settings: { overrides: object } };
    expect(reset.settings.overrides).toEqual({});
  }, 60_000);
});

