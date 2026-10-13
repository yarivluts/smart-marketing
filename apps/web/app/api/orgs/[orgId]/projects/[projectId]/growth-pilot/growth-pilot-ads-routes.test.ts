// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, getAdStudioBrief } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { configureAdStudioRuntime, createMemoryMediaStorage, resetAdStudioRuntime } from '@/lib/ad-studio/engine';
import type { GrowthPilotPageData } from '@/lib/growth-pilot/view';
import { POST as startPilot } from './route';
import { POST as advancePilot } from './advance/route';
import { POST as decide } from './proposals/[proposalId]/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/orgs/selected-environment', () => ({ resolveSelectedEnvironment: async () => ({ selected: null, environments: [] }) }));

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
// A real 64x64 PNG: the studio decodes it when it sets a headline itself.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAoElEQVR4nO2SQQkAQRDDKr8WzkJUroh7hIFCBSSh6cfpRSfoBNArdhfi7qITdALoFbsLcXfRCToB9Irdhbi76ASdAHrF7kLcXXSCTgC9Ynch7i46QSeAXrG7EHcXnaATQK/YXYi7i07QCaBX7C7E3UUn6ATQK3YX4u6iE3QC6BW7C3F30Qk6AfSK3YW4u+gEnQB6xe5C3F10gk4AveKfCz2fxLGlfbPmmAAAAABJRU5ErkJggg==',
  'base64',
);

const SITE = '<html><head><title>EasySign</title></head><body><h1>Sign in 30 seconds</h1><p>Contracts signed on WhatsApp.</p></body></html>';
const ANALYSIS = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'en',
  offerings: [{ kind: 'service', name: 'Pro plan', description: '20 documents a month', forWhom: 'Small offices', why: 'Offices sign every day' }],
  audiences: [],
};
const PLAN = { summary: 'Show how fast signing is.', audience: 'Small offices', landingPageSummary: '', messagingAngles: ['Speed'], keywordThemes: [], recommendations: [], marketNotes: [] };

/** Gemini as the pilot and the Ad Studio call it: text by the schema asked for, images, and the image checks. */
function fakeGemini() {
  const kinds: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(GEMINI)) return new Response(SITE, { headers: { 'content-type': 'text/html' } });
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      if (url === `${GEMINI}/interactions`) {
        kinds.push('image');
        return Response.json({ id: 'img', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] });
      }
      const schema = JSON.stringify((body.generationConfig as { responseJsonSchema?: unknown } | undefined)?.responseJsonSchema ?? {});
      const answer = schema.includes('"offerings"')
        ? (kinds.push('analysis'), ANALYSIS)
        : schema.includes('"messagingAngles"')
          ? (kinds.push('plan'), PLAN)
          : schema.includes('"concepts"')
            ? (kinds.push('concepts'), { concepts: [{ visualPrompt: 'An office worker signing on a phone at a bright desk', headline: 'Sign in 30 seconds', formats: ['square', 'portrait'] }] })
            : schema.includes('"textInImage"')
              ? (kinds.push('check'), { textInImage: 'Sign in 30 seconds', issues: [] })
              : schema.includes('"words"')
                ? (kinds.push('read'), { words: ['Sign', 'in', '30', 'seconds'] })
                : (kinds.push('other'), {});
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    }),
  );
  return kinds;
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

describe('Growth Pilot ads', () => {
  it('turns an approved target into checked image ads, puts them up for approval, and the person approves them', async () => {
    const kinds = fakeGemini();
    const session = { uid: `uid-${Math.random().toString(36).slice(2)}`, email: `owner-${Math.random().toString(36).slice(2)}@example.com`, email_verified: true } as DecodedIdToken;
    const owner = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email: session.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Ads Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    getServerSessionMock.mockResolvedValue(session);
    const p = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ orgId: organization.id, projectId: project.id, ...extra }) }) as never;

    await startPilot(request({ siteUrl: 'easysign.co.il' }), p());
    const read = await json(await advancePilot(request(), p()));
    const [targetProposal] = read.proposals;
    await decide(request({ action: 'approve' }), p({ proposalId: targetProposal.id }));

    // The page keeps calling advance; each call does one unit (brief, plan, ideas, an image...).
    let data = read;
    for (let call = 0; call < 12; call += 1) {
      data = await json(await advancePilot(request(), p()));
      if (data.targets[0].adsStatus !== 'building' && data.targets[0].briefId) break;
    }
    const target = data.targets[0];
    expect(target).toMatchObject({ status: 'active', adsStatus: 'ready' });
    expect(kinds).toEqual(expect.arrayContaining(['analysis', 'plan', 'concepts', 'image', 'check']));

    const brief = await getAdStudioBrief(organization.id, project.id, target.briefId!);
    expect(brief).toMatchObject({ name: 'Pro plan', landing_page_url: 'https://easysign.co.il/', language: 'en' });

    const ads = data.proposals.find((proposal) => proposal.kind === 'ads');
    expect(ads).toMatchObject({ status: 'pending', briefId: target.briefId });
    expect(ads!.previewImageIds.length).toBeGreaterThan(0);
    expect(data.activity.map((row) => row.kind)).toEqual(expect.arrayContaining(['ads_building', 'ads_ready']));

    const approved = await json(await decide(request({ action: 'approve' }), p({ proposalId: ads!.id })));
    expect(approved.targets[0].adsStatus).toBe('approved');
    // Nothing left to do: another advance changes nothing.
    const after = await json(await advancePilot(request(), p()));
    expect(after.targets[0].adsStatus).toBe('approved');
  }, 60_000);
});
