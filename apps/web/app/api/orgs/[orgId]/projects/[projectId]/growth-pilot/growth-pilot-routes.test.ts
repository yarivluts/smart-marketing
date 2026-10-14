// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization, listAdStudioUsage, listAuditLogEntriesForOrg, saveGrowthPublishProposal } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, resetAdStudioRuntime } from '@/lib/ad-studio/engine';
import type { GrowthPilotPageData } from '@/lib/growth-pilot/view';
import { GET as getPilot, POST as startPilot } from './route';
import { POST as advancePilot } from './advance/route';
import { POST as decide } from './proposals/[proposalId]/route';
import { POST as requestTarget } from './targets/route';
import { POST as pausePilot } from './pause/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

const SITE: Record<string, string> = {
  'https://easysign.co.il/': '<html><head><title>EasySign</title></head><body><h1>Sign in 30 seconds</h1><a href="/services/lawyers">Lawyers</a></body></html>',
  'https://easysign.co.il/services/lawyers': '<html><head><title>For lawyers</title></head><body><p>Contracts signed on WhatsApp.</p></body></html>',
};
const siteFetch = vi.fn(async (url: string) => (SITE[url] ? new Response(SITE[url], { headers: { 'content-type': 'text/html' } }) : new Response('', { status: 404 })));

const ANALYSIS = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'en',
  offerings: [{ kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', forWhom: 'Small law firms', why: 'Worth it' }],
  audiences: [{ name: 'Law firms', description: 'Small firms', needs: 'Faster signatures', why: 'Worth it' }],
};

/** Gemini text: the site analysis or a target, by the schema it was asked for. */
function fakeGemini() {
  const prompts: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    expect(url.endsWith(':generateContent')).toBe(true);
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[]; generationConfig: { responseJsonSchema: unknown } };
    prompts.push(body.contents[0].parts[0].text);
    const schema = JSON.stringify(body.generationConfig.responseJsonSchema);
    const answer = schema.includes('"offerings"')
      ? ANALYSIS
      : { kind: 'audience', name: 'Accountants', description: 'Bookkeeping offices', audience: 'Signed forms fast', reason: 'They sign every month' };
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, prompts };
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

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function setup() {
  const email = `${unique('owner')}@example.com`;
  const session = { uid: unique('uid'), email, email_verified: true } as DecodedIdToken;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  const { organization } = await createOrganizationWithOwner({ name: 'Pilot Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue(session);
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId: organization.id, projectId: project.id, ...extra }) }) as never;
  return { orgId: organization.id, projectId: project.id, ownerId: owner.id, p };
}

const json = async (response: Response) => (await response.json()) as GrowthPilotPageData & { error?: string };

describe('Growth Pilot routes', () => {
  it('starts on a website, reads it, and puts every proposed target in front of the person', async () => {
    const gemini = fakeGemini();
    const { orgId, projectId, p } = await setup();
    expect(await json(await getPilot(request('GET'), p()))).toEqual({ pilot: null });
    expect((await startPilot(request('POST', { siteUrl: 'nope' }), p())).status).toBe(400);

    const started = await startPilot(request('POST', { siteUrl: 'easysign.co.il' }), p());
    expect(started.status).toBe(201);
    expect((await json(started)).pilot).toMatchObject({ siteUrl: 'https://easysign.co.il/', status: 'analyzing' });

    const advanced = await json(await advancePilot(request('POST'), p()));
    expect(advanced.pilot).toMatchObject({ status: 'active', analysis: { businessName: 'EasySign' } });
    expect(advanced.pilot.pagesRead.map((page) => page.title)).toEqual(['EasySign', 'For lawyers']);
    expect(advanced.targets.map((target) => [target.name, target.status])).toEqual([
      ['Digital signature', 'proposed'],
      ['Law firms', 'proposed'],
    ]);
    expect(advanced.proposals.every((proposal) => proposal.status === 'pending')).toBe(true);
    expect(gemini.prompts[0]).toContain('Contracts signed on WhatsApp.');
    const usage = await listAdStudioUsage(orgId, projectId);
    expect(usage.map((row) => row.kind)).toEqual(['site_analysis']);

    // A second advance has nothing to do: no second model call.
    await advancePilot(request('POST'), p());
    expect(gemini.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('approves, rejects, revises on request and adds a requested target - the person decides each', async () => {
    fakeGemini();
    const { orgId, p } = await setup();
    await startPilot(request('POST', { siteUrl: 'easysign.co.il' }), p());
    const ready = await json(await advancePilot(request('POST'), p()));
    const [first, second] = ready.proposals;

    expect((await decide(request('POST', { action: 'maybe' }), p({ proposalId: first.id }))).status).toBe(400);
    const approved = await json(await decide(request('POST', { action: 'approve' }), p({ proposalId: first.id })));
    expect(approved.targets.find((target) => target.id === first.targetId)?.status).toBe('active');
    expect((await decide(request('POST', { action: 'approve' }), p({ proposalId: first.id }))).status).toBe(409);

    expect((await decide(request('POST', { action: 'revise', request: ' ' }), p({ proposalId: second.id }))).status).toBe(400);
    const revised = await json(await decide(request('POST', { action: 'revise', request: 'Accountants instead' }), p({ proposalId: second.id })));
    const back = revised.proposals.find((proposal) => proposal.id === second.id);
    expect(back).toMatchObject({ status: 'pending', draft: { name: 'Accountants' }, changes: [{ text: 'Accountants instead', outcome: 'done' }] });
    const rejected = await json(await decide(request('POST', { action: 'reject' }), p({ proposalId: second.id })));
    expect(rejected.targets.find((target) => target.id === second.targetId)?.status).toBe('rejected');

    const added = await requestTarget(request('POST', { request: 'Accountants in the north' }), p());
    expect(added.status).toBe(201);
    const withNew = await json(added);
    expect(withNew.targets.at(-1)).toMatchObject({ name: 'Accountants', origin: 'request', status: 'proposed' });

    const paused = await json(await pausePilot(request('POST', { paused: true }), p()));
    expect(paused.pilot.status).toBe('paused');
    expect(paused.activity.map((row) => row.kind)).toEqual(expect.arrayContaining(['proposal_approved', 'proposal_revised', 'proposal_rejected', 'target_requested', 'pilot_paused']));

    const audit = await listAuditLogEntriesForOrg(orgId);
    expect(audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(['growth_pilot.started', 'growth_pilot.proposal_approved', 'growth_pilot.proposal_rejected', 'growth_pilot.paused']));
  });

  it('records a site it cannot read so the person can try another address', async () => {
    fakeGemini();
    const { p } = await setup();
    await startPilot(request('POST', { siteUrl: 'missing.co.il' }), p());
    const failed = await json(await advancePilot(request('POST'), p()));
    expect(failed.pilot).toMatchObject({ status: 'failed', failureCode: 'site_http_error' });
  });

  it('publishing needs the publish permission and a connected Meta account, and never goes through the plain decision', async () => {
    fakeGemini();
    const { orgId, projectId, ownerId, p } = await setup();
    await startPilot(request('POST', { siteUrl: 'easysign.co.il' }), p());
    const ready = await json(await advancePilot(request('POST'), p()));
    const target = ready.targets[0];
    const publish = await saveGrowthPublishProposal({ organizationId: orgId, projectId, targetId: target.id, plan: { destination: 'meta', imageIds: ['i1'], dailyBudget: 20, linkUrl: 'https://a.co/', campaignName: 'C', countries: ['IL'] } });

    // No Meta account connected in this project: a clear refusal, nothing published.
    const noMeta = await decide(request('POST', { action: 'approve', dailyBudget: 20 }), p({ proposalId: publish.id }));
    expect(noMeta.status).toBe(409);
    expect(await noMeta.json()).toMatchObject({ error: 'meta_unavailable' });

    // A member who may use AI but not act on ad platforms cannot publish.
    const memberEmail = `${unique('member')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: orgId, email: memberEmail, role: 'editor', invitedByUserId: ownerId, projectId });
    const memberSession = { uid: unique('uid'), email: memberEmail, email_verified: true } as DecodedIdToken;
    const member = await ensureUserForFirebaseSession({ firebaseUid: memberSession.uid, email: memberEmail });
    await acceptInvite({ organizationId: orgId, membershipId: invitation.id, userId: member.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(memberSession);
    const forbidden = await decide(request('POST', { action: 'approve', dailyBudget: 20 }), p({ proposalId: publish.id }));
    expect([403, 404]).toContain(forbidden.status);
  });
});
