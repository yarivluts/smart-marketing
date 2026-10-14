// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  getGrowthPilot: vi.fn(),
  getCurrentGrowthPilot: vi.fn(),
  acquireGrowthPilotLease: vi.fn(),
  saveGrowthPilotAnalysis: vi.fn(),
  failGrowthPilotAnalysis: vi.fn(),
  requestGrowthProposalChange: vi.fn(),
  completeGrowthProposalRevision: vi.fn(),
  addRequestedGrowthTarget: vi.fn(),
  listGrowthTargets: vi.fn(),
  getGrowthTarget: vi.fn(),
  linkGrowthTargetAds: vi.fn(),
  finishGrowthTargetAds: vi.fn(),
  createAdStudioBrief: vi.fn(),
  listGrowthPilotIndex: vi.fn(),
  recordGrowthPilotRun: vi.fn(),
  listAdStudioExports: vi.fn(),
  resolveAdStudioExportDestinations: vi.fn(),
  listGrowthProposals: vi.fn(),
  listGrowthLandingPages: vi.fn(),
  saveGrowthPublishProposal: vi.fn(),
  markGrowthTargetNeedsMeta: vi.fn(),
  getGrowthProposal: vi.fn(),
  failGrowthPublish: vi.fn(),
  markGrowthAdsPublished: vi.fn(),
  markGrowthAdsRunning: vi.fn(),
  failGrowthAudience: vi.fn(),
  saveGrowthAudienceProposal: vi.fn(),
  updateGrowthAudiencePlan: vi.fn(),
  failGrowthLanding: vi.fn(),
  getGrowthLandingPage: vi.fn(),
  saveGrowthLandingDraft: vi.fn(),
  updateGrowthLandingContent: vi.fn(),
  getAdStudioBrief: vi.fn(),
  getAdStudioRun: vi.fn(),
  assertAdStudioQuota: vi.fn(),
  recordAdStudioUsage: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));
vi.mock('./planning-sources', async (importOriginal) => ({ ...(await importOriginal<object>()), serverKms: () => ({ kind: 'test-kms' }) }));
const studio = vi.hoisted(() => ({ startAdStudioAutopilot: vi.fn(), advanceAdStudioAutopilot: vi.fn(), listBriefImages: vi.fn(), rewriteAdStudioImageConcept: vi.fn() }));
vi.mock('./autopilot', () => ({ startAdStudioAutopilot: studio.startAdStudioAutopilot, advanceAdStudioAutopilot: studio.advanceAdStudioAutopilot }));
const meta = vi.hoisted(() => ({ searchAdStudioMetaInterests: vi.fn(), estimateAdStudioMetaReach: vi.fn(), loadAdStudioMetaCampaignInsights: vi.fn() }));
vi.mock('./audiences', () => meta);
vi.mock('./image-pipeline', () => ({ listBriefImages: studio.listBriefImages, rewriteAdStudioImageConcept: studio.rewriteAdStudioImageConcept }));

import { AdStudioQuotaExceededError } from '@growthos/firebase-orm-models';
import { advanceGrowthPilot, approveGrowthActivation, GROWTH_SCHEDULER_UNITS_PER_PILOT, loadGrowthPerformance, runScheduledGrowthPilots, approveGrowthPublish, GROWTH_ADS_RUN_OPTIONS, GROWTH_DEFAULT_DAILY_BUDGET, growthFailureCode, readGrowthSite, requestGrowthTarget, reviseGrowthProposal } from './growth-pilot';
import { AdStudioProviderError, type AdStudioLlm } from './llm';

const publicResolver = vi.fn(async () => ['93.184.215.14']);
const html = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

const HOME = `<html><head><title>EasySign</title></head><body><h1>Sign in 30 seconds</h1>
  <a href="/services/lawyers">Lawyers</a><a href="/pricing">Pricing</a><a href="/broken">Broken</a></body></html>`;
const PAGES: Record<string, string> = {
  'https://easysign.co.il/': HOME,
  'https://easysign.co.il/services/lawyers': '<html><head><title>For lawyers</title></head><body><p>Contracts signed on WhatsApp.</p></body></html>',
  'https://easysign.co.il/pricing': '<html><head><title>Pricing</title></head><body><p>Two documents free.</p></body></html>',
};
const fetchSite = vi.fn(async (url: string) => (PAGES[url] ? html(PAGES[url]) : new Response('no', { status: 404 })));

const ANALYSIS = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'en',
  offerings: [{ kind: 'service' as const, name: 'Digital signature', description: 'Fast', forWhom: 'Lawyers', why: 'Worth it' }],
  audiences: [{ name: 'Law firms', description: 'Small firms', needs: 'Speed', why: 'Worth it' }],
};

function llm(result: unknown | Error): AdStudioLlm & { generateJson: ReturnType<typeof vi.fn> } {
  return { provider: 'gemini', model: 'gemini-test', generateJson: vi.fn(async () => { if (result instanceof Error) throw result; return result; }) } as never;
}

const ctx = (model: AdStudioLlm) => ({ organizationId: 'o', projectId: 'p', actorId: 'u', llm: model, deps: { fetchImpl: fetchSite as unknown as typeof fetch, resolver: publicResolver } });
const PILOT = { id: 'g1', organization_id: 'o', project_id: 'p', site_url: 'https://easysign.co.il/', status: 'analyzing', analysis: null };

beforeEach(() => {
  for (const fn of Object.values(orm)) fn.mockReset();
  for (const fn of Object.values(studio)) fn.mockReset();
  for (const fn of Object.values(meta)) fn.mockReset();
  orm.getGrowthPilot.mockResolvedValue(PILOT);
  orm.acquireGrowthPilotLease.mockResolvedValue('lease');
  orm.saveGrowthPilotAnalysis.mockImplementation(async (params: { drafts: unknown[] }) => ({ ...PILOT, status: 'active', drafts: params.drafts }));
  orm.failGrowthPilotAnalysis.mockImplementation(async (params: { code: string }) => ({ ...PILOT, status: 'failed', failure_code: params.code }));
});

describe('readGrowthSite', () => {
  it('reads the home page and the offer pages it links to, skipping a page that fails', async () => {
    const read = await readGrowthSite('https://easysign.co.il/', { fetchImpl: fetchSite as unknown as typeof fetch, resolver: publicResolver });
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    expect(read.pages.map((page) => page.title)).toEqual(['EasySign', 'For lawyers', 'Pricing']);
    expect(read.pages[1].text).toContain('WhatsApp');
  });

  it('fails only when the home page cannot be read', async () => {
    const read = await readGrowthSite('https://nowhere.co.il/', { fetchImpl: fetchSite as unknown as typeof fetch, resolver: publicResolver });
    expect(read).toEqual({ status: 'unavailable', reason: 'http_error' });
  });
});

describe('advanceGrowthPilot', () => {
  it('reads the site, asks the model once, and proposes the targets', async () => {
    const model = llm(ANALYSIS);
    const pilot = await advanceGrowthPilot({ ...ctx(model), pilotId: 'g1' });
    expect(pilot.status).toBe('active');
    expect(model.generateJson).toHaveBeenCalledTimes(1);
    expect(model.generateJson.mock.calls[0][0].user).toContain('### Page 2: https://easysign.co.il/services/lawyers');
    const saved = orm.saveGrowthPilotAnalysis.mock.calls[0][0];
    expect(saved.drafts.map((draft: { name: string }) => draft.name)).toEqual(['Digital signature', 'Law firms']);
    expect(saved.pages).toHaveLength(3);
    expect(orm.recordAdStudioUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'site_analysis', outcome: 'succeeded', briefId: null }));
  });

  it('does nothing when the site is already read or another caller holds the lease', async () => {
    const model = llm(ANALYSIS);
    orm.getGrowthPilot.mockResolvedValueOnce({ ...PILOT, status: 'active' });
    expect((await advanceGrowthPilot({ ...ctx(model), pilotId: 'g1' })).status).toBe('active');
    orm.acquireGrowthPilotLease.mockResolvedValueOnce(null);
    expect((await advanceGrowthPilot({ ...ctx(model), pilotId: 'g1' })).status).toBe('analyzing');
    expect(model.generateJson).not.toHaveBeenCalled();
  });

  it('records why it failed: an unreachable site, the daily limit, or a site with nothing to offer', async () => {
    orm.getGrowthPilot.mockResolvedValueOnce({ ...PILOT, site_url: 'https://nowhere.co.il/' });
    expect(await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1' })).toMatchObject({ failure_code: 'site_http_error' });
    orm.assertAdStudioQuota.mockRejectedValueOnce(new AdStudioQuotaExceededError('text', 50, 50));
    expect(await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1' })).toMatchObject({ failure_code: 'quota_exceeded' });
    expect(await advanceGrowthPilot({ ...ctx(llm({ ...ANALYSIS, offerings: [], audiences: [] })), pilotId: 'g1' })).toMatchObject({ failure_code: 'nothing_found' });
  });
});

describe('revising and requesting targets', () => {
  const DRAFT = { kind: 'audience' as const, name: 'Law firms', description: 'd', audience: 'a', reason: 'r' };

  it('rewrites a held proposal with the request, and returns it unchanged with a reason when the model fails', async () => {
    orm.requestGrowthProposalChange.mockResolvedValue({ id: 'x', pilot_id: 'g1', draft: DRAFT, change_requests: [{ text: 'Only Tel Aviv' }] });
    orm.getGrowthPilot.mockResolvedValue({ ...PILOT, status: 'active', analysis: ANALYSIS });
    orm.completeGrowthProposalRevision.mockImplementation(async (params: unknown) => params);
    const model = llm({ ...DRAFT, audience: 'Tel Aviv firms' });
    const done = (await reviseGrowthProposal({ ...ctx(model), proposalId: 'x', request: 'Only Tel Aviv' })) as unknown as { draft: { audience: string } };
    expect(done.draft.audience).toBe('Tel Aviv firms');
    expect(model.generateJson.mock.calls[0][0].user).toContain('Only Tel Aviv');
    const failed = (await reviseGrowthProposal({ ...ctx(llm(new AdStudioProviderError('rate_limited', 'slow down'))), proposalId: 'x', request: 'Only Tel Aviv' })) as unknown as { draft: null; failureCode: string };
    expect(failed).toMatchObject({ draft: null, failureCode: 'rate_limited' });
  });

  it('turns a request into a proposed target, and refuses an empty request or an unread site', async () => {
    orm.getGrowthPilot.mockResolvedValue({ ...PILOT, status: 'active', analysis: ANALYSIS });
    orm.addRequestedGrowthTarget.mockImplementation(async (params: { draft: unknown }) => ({ status: 'pending', draft: params.draft }));
    const proposal = await requestGrowthTarget({ ...ctx(llm(DRAFT)), pilotId: 'g1', request: 'Law firms in the north' });
    expect(proposal).toMatchObject({ status: 'pending', draft: DRAFT });
    await expect(requestGrowthTarget({ ...ctx(llm(DRAFT)), pilotId: 'g1', request: '  ' })).rejects.toThrow('Say what to grow');
    orm.getGrowthPilot.mockResolvedValueOnce(PILOT);
    await expect(requestGrowthTarget({ ...ctx(llm(DRAFT)), pilotId: 'g1', request: 'x' })).rejects.toThrow('not been read');
  });

  it('words failures as stable codes', () => {
    expect(growthFailureCode(new AdStudioQuotaExceededError('text', 1, 1))).toBe('quota_exceeded');
    expect(growthFailureCode(new AdStudioProviderError('provider_billing', 'x'))).toBe('provider_billing');
    expect(growthFailureCode(new Error('boom'))).toBe('provider_error');
  });
});

describe('making ads for approved targets', () => {
  const ACTIVE = { ...PILOT, status: 'active', analysis: { ...ANALYSIS, offerings: [{ ...ANALYSIS.offerings[0], why: 'w' }], audiences: [] } };
  const TARGET = { id: 't1', pilot_id: 'g1', kind: 'service', name: 'Pro plan', description: '20 documents', audience: 'Small offices', status: 'active', brief_id: null, run_id: null, ads_status: 'none', landing_status: 'ready' };
  const autopilot = {} as never;
  const run = (extra: object) => ({ id: 'r1', status: 'running', failure_code: null, steps: [{ id: 'images', reason: null }], ...extra });

  beforeEach(() => {
    orm.getGrowthPilot.mockResolvedValue(ACTIVE);
  });

  it('opens a brief for the next approved target, in the site language and sending people to the site, and starts image ads without video', async () => {
    orm.listGrowthTargets.mockResolvedValue([{ ...TARGET, status: 'proposed' }, TARGET]);
    orm.createAdStudioBrief.mockResolvedValue({ id: 'b1' });
    studio.startAdStudioAutopilot.mockResolvedValue(run({}));
    await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1', autopilot });
    const input = orm.createAdStudioBrief.mock.calls[0][0].input;
    expect(input).toMatchObject({ name: 'Pro plan', landingPageUrl: 'https://easysign.co.il/', language: 'en' });
    expect(studio.startAdStudioAutopilot).toHaveBeenCalledWith(expect.objectContaining({ briefId: 'b1', options: GROWTH_ADS_RUN_OPTIONS }));
    expect(GROWTH_ADS_RUN_OPTIONS).toMatchObject({ images: true, video: false, confirmPlan: false });
    expect(orm.linkGrowthTargetAds).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', briefId: 'b1', runId: 'r1' }));
  });

  it('advances a running autopilot one step, then puts the chosen ready images up for approval', async () => {
    orm.listGrowthTargets.mockResolvedValue([{ ...TARGET, ads_status: 'building', brief_id: 'b1', run_id: 'r1' }]);
    orm.getAdStudioRun.mockResolvedValue(run({}));
    studio.advanceAdStudioAutopilot.mockResolvedValueOnce(run({}));
    await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1', autopilot });
    expect(studio.advanceAdStudioAutopilot).toHaveBeenCalledTimes(1);
    expect(orm.finishGrowthTargetAds).not.toHaveBeenCalled();

    studio.advanceAdStudioAutopilot.mockResolvedValueOnce(run({ status: 'done' }));
    studio.listBriefImages.mockResolvedValue([
      { id: 'i1', selected: true, status: 'ready' },
      { id: 'i2', selected: false, status: 'ready' },
      { id: 'i3', selected: true, status: 'failed' },
    ]);
    await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1', autopilot });
    expect(orm.finishGrowthTargetAds).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', previewImageIds: ['i1'], failureCode: null }));
    expect(orm.createAdStudioBrief).not.toHaveBeenCalled();
  });

  it('says why when a run ends without images, and does nothing while the pilot is paused', async () => {
    orm.listGrowthTargets.mockResolvedValue([{ ...TARGET, ads_status: 'building', brief_id: 'b1', run_id: 'r1' }]);
    orm.getAdStudioRun.mockResolvedValue(run({ status: 'done', steps: [{ id: 'images', reason: 'quota_exceeded' }] }));
    studio.listBriefImages.mockResolvedValue([]);
    await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1', autopilot });
    expect(orm.finishGrowthTargetAds).toHaveBeenCalledWith(expect.objectContaining({ previewImageIds: [], failureCode: 'quota_exceeded' }));

    orm.finishGrowthTargetAds.mockClear();
    orm.getGrowthPilot.mockResolvedValue({ ...ACTIVE, status: 'paused' });
    await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1', autopilot });
    expect(orm.listGrowthTargets).toHaveBeenCalledTimes(1);
    expect(orm.finishGrowthTargetAds).not.toHaveBeenCalled();
  });

  it('records why the ads did not start when the autopilot cannot start', async () => {
    orm.listGrowthTargets.mockResolvedValue([TARGET]);
    orm.createAdStudioBrief.mockResolvedValue({ id: 'b1' });
    studio.startAdStudioAutopilot.mockRejectedValue(new AdStudioProviderError('not_configured', 'no model'));
    await advanceGrowthPilot({ ...ctx(llm(ANALYSIS)), pilotId: 'g1', autopilot });
    expect(orm.finishGrowthTargetAds).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', failureCode: 'not_configured' }));
  });

  it('rewrites every image idea by the request and renders again, keeping the proposal held', async () => {
    const held = { id: 'p9', kind: 'ads', pilot_id: 'g1', target_id: 't1', brief_id: 'b1', change_requests: [{ text: 'Brighter photos' }] };
    orm.requestGrowthProposalChange.mockResolvedValue(held);
    orm.getAdStudioBrief.mockResolvedValue({ id: 'b1', image_concepts: [{ id: 'c1' }, { id: 'c2' }] });
    orm.getGrowthTarget.mockResolvedValue(TARGET);
    studio.startAdStudioAutopilot.mockResolvedValue(run({ id: 'r2' }));
    const result = await reviseGrowthProposal({ ...ctx(llm(ANALYSIS)), proposalId: 'p9', request: 'Brighter photos' });
    expect(result).toBe(held);
    expect(studio.rewriteAdStudioImageConcept.mock.calls.map((call) => [call[0].conceptId, call[0].instruction])).toEqual([
      ['c1', 'Brighter photos'],
      ['c2', 'Brighter photos'],
    ]);
    expect(orm.linkGrowthTargetAds).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', runId: 'r2' }));
    expect(orm.completeGrowthProposalRevision).not.toHaveBeenCalled();

    studio.rewriteAdStudioImageConcept.mockRejectedValueOnce(new AdStudioQuotaExceededError('text', 50, 50));
    await reviseGrowthProposal({ ...ctx(llm(ANALYSIS)), proposalId: 'p9', request: 'Brighter photos' });
    expect(orm.completeGrowthProposalRevision).toHaveBeenCalledWith(expect.objectContaining({ draft: null, failureCode: 'quota_exceeded' }));
  });
});

describe('landing pages for approved targets', () => {
  const ACTIVE = { ...PILOT, status: 'active', site_url: 'https://easy-sign.co.il/', analysis: { ...ANALYSIS, language: 'he', offerings: [{ ...ANALYSIS.offerings[0], why: 'w' }], audiences: [] } };
  const TARGET = { id: 't1', pilot_id: 'g1', kind: 'service', name: 'Pro plan', description: '20 documents', audience: 'Small offices', status: 'active', brief_id: null, ads_status: 'none', landing_status: 'none' };
  const PAGE = { eyebrow: 'For offices', headline: 'Sign 20 documents', subheadline: 'On WhatsApp', benefits: [{ title: 'Fast', text: 'Seconds' }], steps: [], faq: [], ctaText: 'Start now', closingHeadline: 'Ready?' };

  beforeEach(() => {
    orm.getGrowthPilot.mockResolvedValue(ACTIVE);
  });

  it('writes the page for an approved target before starting its ads, in the site language, with the tagged site as the button', async () => {
    orm.listGrowthTargets.mockResolvedValue([TARGET]);
    const model = llm(PAGE);
    await advanceGrowthPilot({ ...ctx(model), pilotId: 'g1', autopilot: {} as never });
    expect(model.generateJson.mock.calls[0][0].user).toContain('This page is for: Pro plan (service)');
    expect(orm.saveGrowthLandingDraft).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', content: PAGE, language: 'he', siteUrl: 'https://easy-sign.co.il/' }));
    expect(orm.recordAdStudioUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'landing_page', outcome: 'succeeded' }));
    expect(orm.createAdStudioBrief).not.toHaveBeenCalled();
  });

  it('records why when the page could not be written: the limit, or a page without a headline', async () => {
    orm.listGrowthTargets.mockResolvedValue([TARGET]);
    orm.assertAdStudioQuota.mockRejectedValueOnce(new AdStudioQuotaExceededError('text', 50, 50));
    await advanceGrowthPilot({ ...ctx(llm(PAGE)), pilotId: 'g1', autopilot: {} as never });
    expect(orm.failGrowthLanding).toHaveBeenLastCalledWith(expect.objectContaining({ targetId: 't1', failureCode: 'quota_exceeded' }));
    await advanceGrowthPilot({ ...ctx(llm({ ...PAGE, headline: '' })), pilotId: 'g1', autopilot: {} as never });
    expect(orm.failGrowthLanding).toHaveBeenLastCalledWith(expect.objectContaining({ failureCode: 'invalid_output' }));
    expect(orm.saveGrowthLandingDraft).not.toHaveBeenCalled();
  });

  it('revises the page by the request and puts it back for a decision', async () => {
    const held = { id: 'lp1', kind: 'landing_page', pilot_id: 'g1', target_id: 't1', landing_page_id: 'page1', draft: { name: 'Pro plan' }, change_requests: [{ text: 'Shorter headline' }] };
    orm.requestGrowthProposalChange.mockResolvedValue(held);
    orm.getGrowthLandingPage.mockResolvedValue({ id: 'page1', content: PAGE });
    orm.getGrowthTarget.mockResolvedValue(TARGET);
    const model = llm({ ...PAGE, headline: 'Sign fast' });
    await reviseGrowthProposal({ ...ctx(model), proposalId: 'lp1', request: 'Shorter headline' });
    expect(model.generateJson.mock.calls[0][0].user).toContain('"headline": "Sign 20 documents"');
    expect(orm.updateGrowthLandingContent).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page1', content: expect.objectContaining({ headline: 'Sign fast' }) }));
    expect(orm.completeGrowthProposalRevision).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'lp1', draft: { name: 'Pro plan' } }));
  });
});

describe('audiences for targets with ads', () => {
  const ACTIVE = { ...PILOT, status: 'active', analysis: { ...ANALYSIS, language: 'he', offerings: [], audiences: [] } };
  const TARGET = { id: 't1', pilot_id: 'g1', kind: 'audience', name: 'Freelancers', description: 'Self-employed', audience: 'Fast signatures', status: 'active', brief_id: 'b1', ads_status: 'ready', landing_status: 'ready', audience_status: 'none' };
  const DRAFT = { summary: 'Freelancers in Israel', countries: ['IL'], ageMin: 25, ageMax: 55, genders: [], interestKeywords: ['Freelancer', 'Small business', 'Paperwork'] };

  beforeEach(() => {
    orm.getGrowthPilot.mockResolvedValue(ACTIVE);
    orm.listGrowthTargets.mockResolvedValue([TARGET]);
  });

  it('keeps only the Meta interests the AI finds relevant - not whatever Meta matched loosely - and estimates the reach', async () => {
    const found: Record<string, { id: string; name: string; path: string[] }[]> = {
      Freelancer: [
        { id: 'movies', name: 'Action movies', path: ['Interests', 'Entertainment', 'Movies'] },
        { id: 'i1', name: 'Freelancer', path: ['Interests', 'Business and industry'] },
      ],
      'Small business': [
        { id: 'i3', name: 'Small business', path: ['Interests', 'Business and industry'] },
        { id: 'i1', name: 'Freelancer', path: ['Interests', 'Business and industry'] },
      ],
      Paperwork: [{ id: 'games', name: 'First-person shooter games', path: ['Interests', 'Games'] }],
    };
    meta.searchAdStudioMetaInterests.mockImplementation(async ({ query }: { query: string }) => ({ status: 'ok', data: (found[query] ?? []).map((interest) => ({ ...interest, sizeLower: 10, sizeUpper: 20 })) }));
    meta.estimateAdStudioMetaReach.mockResolvedValue({ status: 'ok', data: { monthlyLower: 50000, monthlyUpper: 80000, ready: true } });
    const model = llm(DRAFT);
    model.generateJson.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce({ ids: ['i1', 'i3', 'unknown'] });
    await advanceGrowthPilot({ ...ctx(model), pilotId: 'g1', autopilot: {} as never });

    // The AI saw every candidate once, with where Meta files it, and the offer it is choosing for.
    const choice = model.generateJson.mock.calls[1][0];
    expect(choice.user).toContain('id movies: Action movies [Interests > Entertainment > Movies] (for "Freelancer")');
    expect(choice.user.match(/id i1:/g)).toHaveLength(1);
    expect(choice.user).toContain('Offer: Freelancers (audience)');

    const plan = orm.saveGrowthAudienceProposal.mock.calls[0][0].plan;
    expect(plan.targeting.interests.map((interest: { id: string }) => interest.id)).toEqual(['i1', 'i3']);
    // A word whose only matches were unrelated stays unmatched instead of pulling in games.
    expect(plan).toMatchObject({ summary: 'Freelancers in Israel', unresolvedInterests: ['Paperwork'], reach: { lower: 50000, upper: 80000 }, meta: 'ok', targeting: { countries: ['IL'], ageMin: 25, ageMax: 55 } });
    expect(orm.recordAdStudioUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'audience_plan' }));
    expect(meta.searchAdStudioMetaInterests).toHaveBeenCalledWith(expect.objectContaining({ language: 'he' }));
  });

  it('keeps the matched interests when only the reach estimate fails', async () => {
    meta.searchAdStudioMetaInterests.mockResolvedValue({ status: 'ok', data: [{ id: 'i1', name: 'Freelancer', path: [], sizeLower: 1, sizeUpper: 2 }] });
    meta.estimateAdStudioMetaReach.mockResolvedValue({ status: 'unavailable', reason: 'meta_rate_limited' });
    const model = llm(DRAFT);
    model.generateJson.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce({ ids: ['i1'] });
    await advanceGrowthPilot({ ...ctx(model), pilotId: 'g1', autopilot: {} as never });
    expect(orm.saveGrowthAudienceProposal.mock.calls[0][0].plan).toMatchObject({ meta: 'ok', reach: null, targeting: { interests: [{ id: 'i1' }] } });
  });

  it('without Meta keeps countries, ages and genders, and says why interests are not matched', async () => {
    meta.searchAdStudioMetaInterests.mockResolvedValue({ status: 'unavailable', reason: 'no_credential' });
    await advanceGrowthPilot({ ...ctx(llm(DRAFT)), pilotId: 'g1', autopilot: {} as never });
    expect(meta.searchAdStudioMetaInterests).toHaveBeenCalledTimes(1);
    expect(meta.estimateAdStudioMetaReach).not.toHaveBeenCalled();
    expect(orm.saveGrowthAudienceProposal.mock.calls[0][0].plan).toMatchObject({ meta: 'no_credential', reach: null, unresolvedInterests: ['Freelancer', 'Small business', 'Paperwork'], targeting: { interests: [], countries: ['IL'] } });
  });

  it('records why the audience could not be planned, and revises one on request', async () => {
    orm.assertAdStudioQuota.mockRejectedValueOnce(new AdStudioQuotaExceededError('text', 50, 50));
    await advanceGrowthPilot({ ...ctx(llm(DRAFT)), pilotId: 'g1', autopilot: {} as never });
    expect(orm.failGrowthAudience).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', failureCode: 'quota_exceeded' }));

    meta.searchAdStudioMetaInterests.mockResolvedValue({ status: 'unavailable', reason: 'no_credential' });
    const held = { id: 'a1', kind: 'audience', pilot_id: 'g1', target_id: 't1', draft: { name: 'Freelancers' }, change_requests: [{ text: 'Only women' }], audience: { summary: 's', targeting: { countries: ['IL'], ageMin: 25, ageMax: 55, genders: [], customAudiences: [], interests: [{ id: 'i1', name: 'Freelancer', sizeLower: 1, sizeUpper: 2 }] }, unresolvedInterests: ['Paperwork'], reach: null, meta: 'ok' } };
    orm.requestGrowthProposalChange.mockResolvedValue(held);
    orm.getGrowthTarget.mockResolvedValue(TARGET);
    const model = llm({ ...DRAFT, genders: ['female'] });
    await reviseGrowthProposal({ ...ctx(model), proposalId: 'a1', request: 'Only women' });
    expect(model.generateJson.mock.calls[0][0].user).toContain('"Freelancer"');
    expect(model.generateJson.mock.calls[0][0].user).toContain('"Paperwork"');
    expect(orm.updateGrowthAudiencePlan).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'a1', plan: expect.objectContaining({ targeting: expect.objectContaining({ genders: ['female'] }) }) }));
    expect(orm.completeGrowthProposalRevision).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'a1', draft: { name: 'Freelancers' } }));
  });
});

describe('publishing and turning on', () => {
  const ACTIVE = { ...PILOT, status: 'active', site_url: 'https://easy-sign.co.il/', analysis: { ...ANALYSIS, businessName: 'EasySign', language: 'he', offerings: [], audiences: [] } };
  const TARGET = { id: 't1', pilot_id: 'g1', kind: 'service', name: 'Free plan', description: '2 free documents', audience: 'Freelancers', status: 'active', brief_id: 'b1', ads_status: 'approved', landing_status: 'published', audience_status: 'approved', publish_status: 'none', ad_export_ids: ['e1', 'e2'] };
  const PLAN = { destination: 'meta', imageIds: ['i1', 'i2'], dailyBudget: 20, linkUrl: 'https://app.growthos.io/lp/abc', campaignName: 'EasySign - Free plan', countries: ['IL'] };

  beforeEach(() => {
    orm.getGrowthPilot.mockResolvedValue(ACTIVE);
    orm.listGrowthTargets.mockResolvedValue([TARGET]);
    orm.getGrowthTarget.mockResolvedValue(TARGET);
    orm.getAdStudioBrief.mockResolvedValue({ id: 'b1', meta_targeting: { countries: ['IL', 'US'] }, image_concepts: [{ id: 'c1', headline: 'Sign free', copy: { headline: 'Sign in 30s', primaryText: 'Two documents free', description: 'No card' } }, { id: 'c2', headline: 'Fast' }] });
    orm.listGrowthProposals.mockResolvedValue([{ kind: 'ads', status: 'approved', target_id: 't1', preview_image_ids: ['i1', 'i2'] }]);
    orm.listGrowthLandingPages.mockResolvedValue([{ target_id: 't1', status: 'published', slug: 'abc', cta_url: 'https://easy-sign.co.il/?utm_campaign=abc' }]);
  });

  it('waits for a Meta ad account before proposing to publish', async () => {
    orm.resolveAdStudioExportDestinations.mockResolvedValue({ meta: { available: false, reason: 'no_credential' } });
    await advanceGrowthPilot({ ...ctx(llm({})), pilotId: 'g1', autopilot: {} as never, publicWebUrl: 'https://app.growthos.io/' });
    expect(orm.markGrowthTargetNeedsMeta).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1' }));
    expect(orm.saveGrowthPublishProposal).not.toHaveBeenCalled();
  });

  it('proposes the approved images, to the published landing page, in the audience countries, at a default budget', async () => {
    orm.resolveAdStudioExportDestinations.mockResolvedValue({ meta: { available: true, credentialId: 'cr' } });
    await advanceGrowthPilot({ ...ctx(llm({})), pilotId: 'g1', autopilot: {} as never, publicWebUrl: 'https://app.growthos.io/' });
    expect(orm.saveGrowthPublishProposal).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', plan: { ...PLAN, countries: ['IL', 'US'], dailyBudget: GROWTH_DEFAULT_DAILY_BUDGET } }));
  });

  it('does not propose before the audience and the page are decided', async () => {
    orm.listGrowthTargets.mockResolvedValue([{ ...TARGET, audience_status: 'ready' }]);
    orm.resolveAdStudioExportDestinations.mockResolvedValue({ meta: { available: true, credentialId: 'cr' } });
    await advanceGrowthPilot({ ...ctx(llm({})), pilotId: 'g1', autopilot: {} as never });
    expect(orm.saveGrowthPublishProposal).not.toHaveBeenCalled();
  });

  it('publishes every approved image, paused, into one ad set with its idea words and the chosen budget', async () => {
    orm.resolveAdStudioExportDestinations.mockResolvedValue({ meta: { available: true, credentialId: 'cr' } });
    orm.getGrowthProposal.mockResolvedValue({ id: 'pub1', kind: 'publish', status: 'pending', pilot_id: 'g1', target_id: 't1', publish: PLAN });
    studio.listBriefImages.mockResolvedValue([{ id: 'i1', conceptId: 'c1' }, { id: 'i2', conceptId: 'c2' }]);
    let n = 0;
    const publish = vi.fn(async () => ({ id: `e${++n}`, status: 'done' }));
    await approveGrowthPublish({ ...ctx(llm({})), proposalId: 'pub1', dailyBudget: 35 }, { publish: publish as never });
    const calls = publish.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(calls[0]).toMatchObject({ destination: 'meta', source: { kind: 'image', imageId: 'i1' }, dailyBudget: 35, countries: ['IL'], campaignName: 'EasySign - Free plan', copy: { headline: 'Sign in 30s', primaryText: 'Two documents free', description: 'No card', linkUrl: PLAN.linkUrl, businessName: 'EasySign' } });
    expect(calls[0].addToAdSetOf).toBeUndefined();
    expect(calls[1]).toMatchObject({ addToAdSetOf: 'e1', copy: { headline: 'Fast', primaryText: 'Fast' } });
    expect(orm.markGrowthAdsPublished).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'pub1', exportIds: ['e1', 'e2'], dailyBudget: 35 }));
  });

  it('publishes nothing more when the first ad fails, says why, and refuses a bad budget', async () => {
    orm.resolveAdStudioExportDestinations.mockResolvedValue({ meta: { available: true, credentialId: 'cr' } });
    orm.getGrowthProposal.mockResolvedValue({ id: 'pub1', kind: 'publish', status: 'pending', pilot_id: 'g1', target_id: 't1', publish: PLAN });
    studio.listBriefImages.mockResolvedValue([{ id: 'i1', conceptId: 'c1' }]);
    const publish = vi.fn(async () => ({ id: 'e1', status: 'failed', failure_code: 'meta_account_restricted' }));
    await approveGrowthPublish({ ...ctx(llm({})), proposalId: 'pub1' }, { publish: publish as never });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(orm.failGrowthPublish).toHaveBeenCalledWith(expect.objectContaining({ targetId: 't1', failureCode: 'meta_account_restricted' }));
    expect(orm.markGrowthAdsPublished).not.toHaveBeenCalled();
    await expect(approveGrowthPublish({ ...ctx(llm({})), proposalId: 'pub1', dailyBudget: -5 }, { publish: publish as never })).rejects.toThrow('daily budget');
    await expect(approveGrowthPublish({ ...ctx(llm({})), proposalId: 'pub1', dailyBudget: Number.NaN }, { publish: publish as never })).rejects.toThrow('daily budget');
  });

  it('refuses to publish without a Meta ad account before reading or creating anything', async () => {
    orm.getGrowthProposal.mockResolvedValue({ id: 'pub1', kind: 'publish', status: 'pending', pilot_id: 'g1', target_id: 't1', publish: PLAN });
    orm.resolveAdStudioExportDestinations.mockResolvedValue({ meta: { available: false, reason: 'no_credential' } });
    const publish = vi.fn();
    await expect(approveGrowthPublish({ ...ctx(llm({})), proposalId: 'pub1' }, { publish: publish as never })).rejects.toMatchObject({ name: 'AdStudioExportUnavailableError' });
    expect(publish).not.toHaveBeenCalled();
    expect(orm.getAdStudioBrief).not.toHaveBeenCalled();
  });

  it('turns the published ads on only when the person approves that, and records it', async () => {
    orm.getGrowthProposal.mockResolvedValue({ id: 'act1', kind: 'activate', status: 'pending', pilot_id: 'g1', target_id: 't1', publish: PLAN });
    const setStatus = vi.fn(async () => ({ campaigns: 1, adSets: 1, ads: 2 }));
    await approveGrowthActivation({ ...ctx(llm({})), proposalId: 'act1' }, { setStatus: setStatus as never });
    expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ exportIds: ['e1', 'e2'], status: 'ACTIVE', kms: { kind: 'test-kms' } }));
    expect(orm.markGrowthAdsRunning).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'act1' }));

    orm.markGrowthAdsRunning.mockClear();
    const stopped = vi.fn(async () => {
      throw Object.assign(new Error('kill switch'), { name: 'AdStudioAutomationStoppedError' });
    });
    await expect(approveGrowthActivation({ ...ctx(llm({})), proposalId: 'act1' }, { setStatus: stopped as never })).rejects.toThrow('kill switch');
    expect(orm.markGrowthAdsRunning).not.toHaveBeenCalled();
  });
});

describe('the scheduler', () => {
  const line = (id: string, extra: object = {}) => ({ organization_id: 'o-' + id, project_id: 'p-' + id, pilot_id: 'g-' + id, status: 'active', started_by: 'u-' + id, last_run_on: null, ...extra });

  it('runs the pilots that have work, least recently run first, on behalf of whoever started each', async () => {
    orm.listGrowthPilotIndex.mockResolvedValue([
      line('recent', { last_run_on: '2026-10-14T09:00:00Z' }),
      line('paused', { status: 'paused' }),
      line('failed', { status: 'failed' }),
      line('never'),
      line('reading', { status: 'analyzing', last_run_on: '2026-10-14T08:00:00Z' }),
    ]);
    const done: Record<string, number> = { never: 2, reading: 1, recent: 0 };
    const step = vi.fn(async (stepCtx: { pilotId: string }) => {
      const key = stepCtx.pilotId.slice(2);
      const worked = done[key] > 0;
      done[key] -= 1;
      return { pilot: {} as never, worked };
    });
    const runs = await runScheduledGrowthPilots({ llm: llm({}), autopilot: {} as never, budgetMs: 60_000, step: step as never });
    expect(runs.map((run) => [run.projectId, run.units, run.outcome])).toEqual([
      ['p-never', 2, 'worked'],
      ['p-reading', 1, 'worked'],
      ['p-recent', 0, 'idle'],
    ]);
    expect(step.mock.calls[0][0]).toMatchObject({ organizationId: 'o-never', projectId: 'p-never', pilotId: 'g-never', actorId: 'u-never' });
    expect(orm.recordGrowthPilotRun).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p-recent', outcome: 'idle' }));
  });

  it('caps one pilot per run and stops at the time budget, recording a failure and moving on', async () => {
    orm.listGrowthPilotIndex.mockResolvedValue([line('busy'), line('broken'), line('late')]);
    let now = 0;
    const step = vi.fn(async (stepCtx: { pilotId: string }) => {
      now += 1_000;
      if (stepCtx.pilotId === 'g-broken') throw new AdStudioQuotaExceededError('text', 50, 50);
      if (stepCtx.pilotId === 'g-late') now += 1_000_000;
      return { pilot: {} as never, worked: true };
    });
    const runs = await runScheduledGrowthPilots({ llm: llm({}), autopilot: {} as never, budgetMs: 30_000, clock: () => now, step: step as never });
    expect(runs[0]).toMatchObject({ projectId: 'p-busy', units: GROWTH_SCHEDULER_UNITS_PER_PILOT, outcome: 'worked' });
    expect(runs[1]).toMatchObject({ projectId: 'p-broken', units: 0, outcome: 'quota_exceeded' });
    expect(runs[2]).toMatchObject({ projectId: 'p-late', units: 1 });
    expect(runs).toHaveLength(3);
  });
});

describe('performance of published ads', () => {
  const now = new Date('2026-10-14T10:00:00Z');

  it('reads only the campaigns the pilot published, and sums them per target and per day', async () => {
    orm.listGrowthTargets.mockResolvedValue([
      { id: 't1', brief_id: 'b1', ad_export_ids: ['e1', 'e2'] },
      { id: 't2', brief_id: 'b2', ad_export_ids: null },
    ]);
    orm.listAdStudioExports.mockResolvedValue([
      { id: 'e1', platform_refs: { campaign_id: 'c1' } },
      { id: 'e2', platform_refs: { campaign_id: 'c1' } },
      { id: 'e9', platform_refs: { campaign_id: 'not-ours' } },
    ]);
    meta.loadAdStudioMetaCampaignInsights.mockResolvedValue({ status: 'ok', data: [{ campaignId: 'c1', date: '2026-10-14', spend: 12, impressions: 600, clicks: 18, linkClicks: 15, conversions: 2 }] });
    const result = await loadGrowthPerformance({ organizationId: 'o', projectId: 'p', pilotId: 'g1', days: 7, now });
    expect(meta.loadAdStudioMetaCampaignInsights).toHaveBeenCalledWith(expect.objectContaining({ campaignIds: ['c1'], since: '2026-10-08', until: '2026-10-14' }));
    expect(result).toMatchObject({ status: 'ok', since: '2026-10-08', until: '2026-10-14', summary: { totals: { spend: 12, clicks: 18, conversions: 2, costPerConversion: 6 }, byTarget: { t1: { clicks: 18 } } } });
    if (result.status === 'ok') expect(result.summary.daily).toHaveLength(7);
  });

  it('says there is nothing yet before anything is published, and why when Meta cannot be read', async () => {
    orm.listGrowthTargets.mockResolvedValue([{ id: 't1', brief_id: 'b1', ad_export_ids: null }]);
    expect(await loadGrowthPerformance({ organizationId: 'o', projectId: 'p', pilotId: 'g1', days: 30, now })).toEqual({ status: 'none' });
    expect(meta.loadAdStudioMetaCampaignInsights).not.toHaveBeenCalled();

    orm.listGrowthTargets.mockResolvedValue([{ id: 't1', brief_id: 'b1', ad_export_ids: ['e1'] }]);
    orm.listAdStudioExports.mockResolvedValue([{ id: 'e1', platform_refs: { campaign_id: 'c1' } }]);
    meta.loadAdStudioMetaCampaignInsights.mockResolvedValue({ status: 'unavailable', reason: 'meta_auth_failed' });
    expect(await loadGrowthPerformance({ organizationId: 'o', projectId: 'p', pilotId: 'g1', days: 30, now })).toEqual({ status: 'unavailable', reason: 'meta_auth_failed' });
  });
});
