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
  getAdStudioBrief: vi.fn(),
  getAdStudioRun: vi.fn(),
  assertAdStudioQuota: vi.fn(),
  recordAdStudioUsage: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));
const studio = vi.hoisted(() => ({ startAdStudioAutopilot: vi.fn(), advanceAdStudioAutopilot: vi.fn(), listBriefImages: vi.fn(), rewriteAdStudioImageConcept: vi.fn() }));
vi.mock('./autopilot', () => ({ startAdStudioAutopilot: studio.startAdStudioAutopilot, advanceAdStudioAutopilot: studio.advanceAdStudioAutopilot }));
vi.mock('./image-pipeline', () => ({ listBriefImages: studio.listBriefImages, rewriteAdStudioImageConcept: studio.rewriteAdStudioImageConcept }));

import { AdStudioQuotaExceededError } from '@growthos/firebase-orm-models';
import { advanceGrowthPilot, GROWTH_ADS_RUN_OPTIONS, growthFailureCode, readGrowthSite, requestGrowthTarget, reviseGrowthProposal } from './growth-pilot';
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
  const TARGET = { id: 't1', pilot_id: 'g1', kind: 'service', name: 'Pro plan', description: '20 documents', audience: 'Small offices', status: 'active', brief_id: null, run_id: null, ads_status: 'none' };
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
