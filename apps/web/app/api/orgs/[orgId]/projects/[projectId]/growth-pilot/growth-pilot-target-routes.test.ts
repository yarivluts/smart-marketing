// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getPublishedGrowthLanding } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage, resetAdStudioRuntime } from '@/lib/ad-studio/engine';
import type { GrowthPilotPageData } from '@/lib/growth-pilot/view';
import { POST as startPilot } from './route';
import { POST as advancePilot } from './advance/route';
import { POST as decide } from './proposals/[proposalId]/route';
import { POST as changeTarget } from './targets/[targetId]/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/orgs/selected-environment', () => ({ resolveSelectedEnvironment: async () => ({ selected: null, environments: [] }) }));

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAoElEQVR4nO2SQQkAQRDDKr8WzkJUroh7hIFCBSSh6cfpRSfoBNArdhfi7qITdALoFbsLcXfRCToB9Irdhbi76ASdAHrF7kLcXXSCTgC9Ynch7i46QSeAXrG7EHcXnaATQK/YXYi7i07QCaBX7C7E3UUn6ATQK3YX4u6iE3QC6BW7C3F30Qk6AfSK3YW4u+gEnQB6xe5C3F10gk4AveKfCz2fxLGlfbPmmAAAAABJRU5ErkJggg==',
  'base64',
);
const SITE = '<html><head><title>EasySign</title></head><body><h1>Sign in 30 seconds</h1><p>Contracts signed on WhatsApp.</p></body></html>';
const ANALYSIS = { businessName: 'EasySign', summary: 'Signatures on WhatsApp.', language: 'en', offerings: [{ kind: 'service', name: 'Pro plan', description: '20 documents a month', forWhom: 'Small offices', why: 'Offices sign every day' }], audiences: [] };
const LANDING = { eyebrow: 'For small offices', headline: 'Sign 20 documents a month', subheadline: 'On WhatsApp.', benefits: [{ title: 'Fast', text: 'Seconds' }], steps: [], faq: [], ctaText: 'Start now', closingHeadline: 'Ready?' };
const PLAN = { summary: 'Show how fast signing is.', audience: 'Small offices', landingPageSummary: '', messagingAngles: ['Speed'], keywordThemes: [], recommendations: [], marketNotes: [] };

/** Gemini as the pilot calls it; the page it writes takes its headline from `landingHeadline`. */
function fakeGemini(state: { landingHeadline: string; prompts: string[] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(GEMINI)) return new Response(SITE, { headers: { 'content-type': 'text/html' } });
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      if (url === `${GEMINI}/interactions`) return Response.json({ id: 'img', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] });
      state.prompts.push(JSON.stringify(body.contents ?? ''));
      const schema = JSON.stringify((body.generationConfig as { responseJsonSchema?: unknown } | undefined)?.responseJsonSchema ?? {});
      const answer = schema.includes('"offerings"')
        ? ANALYSIS
        : schema.includes('"interestKeywords"')
          ? { summary: 'Small offices in Israel', countries: ['IL'], ageMin: 25, ageMax: 60, genders: [], interestKeywords: ['Small business'] }
          : schema.includes('"closingHeadline"')
            ? { ...LANDING, headline: state.landingHeadline }
            : schema.includes('"messagingAngles"')
              ? PLAN
              : schema.includes('"concepts"')
                ? { concepts: [{ visualPrompt: 'An office worker signing on a phone at a bright desk', headline: 'Sign in 30 seconds', formats: ['square', 'portrait'] }] }
                : schema.includes('"textInImage"')
                  ? { textInImage: 'Sign in 30 seconds', issues: [] }
                  : schema.includes('"words"')
                    ? { words: ['Sign', 'in', '30', 'seconds'] }
                    : {};
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    }),
  );
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  const storage = createMemoryMediaStorage();
  configureAdStudioRuntime({
    mediaStorage: () => storage,
    siteReader: { fetchImpl: (async () => new Response(SITE, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch, resolver: async () => ['93.184.215.14'] },
  });
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAdStudioRuntime();
  delete process.env.GEMINI_API_KEY;
});

const request = (body?: unknown) => new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const json = async (response: Response) => (await response.json()) as GrowthPilotPageData;

async function approvedTargetWithPage() {
  const session = { uid: `uid-${Math.random().toString(36).slice(2)}`, email: `owner-${Math.random().toString(36).slice(2)}@example.com`, email_verified: true } as DecodedIdToken;
  const owner = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email: session.email as string });
  const { organization } = await createOrganizationWithOwner({ name: 'Change Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  getServerSessionMock.mockResolvedValue(session);
  const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId: organization.id, projectId: project.id, ...extra }) }) as never;
  await startPilot(request({ siteUrl: 'easysign.co.il' }), p());
  const read = await json(await advancePilot(request(), p()));
  await decide(request({ action: 'approve' }), p({ proposalId: read.proposals[0].id }));
  // The first unit writes the landing page.
  const data = await json(await advancePilot(request(), p()));
  return { p, data, targetId: data.targets[0].id };
}

describe('Growth Pilot target changes', () => {
  it('a change to a page still waiting for a decision revises that proposal; a live page gets new words to approve', async () => {
    const state = { landingHeadline: 'Sign 20 documents a month', prompts: [] as string[] };
    fakeGemini(state);
    const { p, data, targetId } = await approvedTargetWithPage();
    expect(data.targets[0].landingStatus).toBe('ready');
    const waiting = data.proposals.find((proposal) => proposal.kind === 'landing_page')!;

    state.landingHeadline = 'Sign fast';
    const revised = await json(await changeTarget(request({ action: 'change', area: 'landing', request: 'A shorter headline' }), p({ targetId })));
    const back = revised.proposals.find((proposal) => proposal.id === waiting.id)!;
    expect(back).toMatchObject({ status: 'pending', changes: [{ text: 'A shorter headline', outcome: 'done' }] });
    expect(revised.landingPages[0].content.headline).toBe('Sign fast');
    // Asked on the waiting proposal: nothing is kept on the target itself.
    expect(revised.targets[0].changeRequests).toEqual([]);

    const live = await json(await decide(request({ action: 'approve' }), p({ proposalId: waiting.id })));
    const slug = live.landingPages[0].slug;
    state.landingHeadline = 'Sign today';
    const asked = await json(await changeTarget(request({ action: 'change', area: 'landing', request: 'Mention today' }), p({ targetId })));
    expect(asked.targets[0]).toMatchObject({ landingStatus: 'published', changeRequests: [{ area: 'landing', text: 'Mention today', outcome: 'done' }] });
    const proposed = asked.proposals.find((proposal) => proposal.kind === 'landing_page' && proposal.status === 'pending')!;
    expect(proposed.landingContent).toMatchObject({ headline: 'Sign today' });
    expect(state.prompts.some((prompt) => prompt.includes('Mention today') && prompt.includes('Sign fast'))).toBe(true);
    // The live page keeps its words until the new ones are approved.
    expect((await getPublishedGrowthLanding(slug))?.content.headline).toBe('Sign fast');
    expect(asked.activity.find((row) => row.kind === 'change_requested')).toMatchObject({ targetId, byPilot: false });

    await decide(request({ action: 'approve' }), p({ proposalId: proposed.id }));
    expect((await getPublishedGrowthLanding(slug))?.content.headline).toBe('Sign today');
  }, 60_000);

  it('refuses what it cannot do, with a code the page words', async () => {
    fakeGemini({ landingHeadline: 'Sign', prompts: [] });
    const { p, targetId } = await approvedTargetWithPage();
    const status = async (body: unknown) => {
      const response = await changeTarget(request(body), p({ targetId }));
      return [response.status, ((await response.json()) as { error?: string }).error];
    };
    expect(await status({ action: 'nope' })).toEqual([400, 'invalid_action']);
    expect(await status({ action: 'change', area: 'video', request: 'x' })).toEqual([400, 'invalid_area']);
    expect(await status({ action: 'change', area: 'landing', request: '   ' })).toEqual([400, 'empty_request']);
    // No ads were made yet, so there is no audience to redo.
    expect(await status({ action: 'change', area: 'audience', request: 'Older' })).toEqual([409, 'not_changeable']);
    // A video is made from the ads, and there are none yet.
    expect(await status({ action: 'video' })).toEqual([409, 'not_changeable']);
    expect((await changeTarget(request({ action: 'change', area: 'landing', request: 'x' }), p({ targetId: 'missing' }))).status).toBe(404);

    getServerSessionMock.mockResolvedValue(null);
    expect((await changeTarget(request({ action: 'change', area: 'landing', request: 'x' }), p({ targetId }))).status).toBe(401);
  }, 60_000);
});
