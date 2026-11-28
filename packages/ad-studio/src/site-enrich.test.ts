// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  getAdStudioBrief: vi.fn(),
  getAdStudioBrandKit: vi.fn(),
  getAdStudioDemoAccess: vi.fn(),
  getCurrentGrowthPilot: vi.fn(),
  listAdStudioBriefs: vi.fn(),
  updateAdStudioBriefDetails: vi.fn(),
  updateProjectDetails: vi.fn(),
  saveAdStudioVoice: vi.fn(),
  projectInit: vi.fn(),
  adStudioBriefInput: vi.fn((brief: Record<string, unknown>) => ({
    name: brief.name,
    objective: brief.objective,
    productDescription: brief.product_description,
    landingPageUrl: brief.landing_page_url ?? null,
    format: brief.video_format,
    language: brief.language,
    targetSeconds: brief.target_seconds,
    narrationMode: brief.narration_mode ?? null,
  })),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAdStudioBrief: orm.getAdStudioBrief,
  getAdStudioBrandKit: orm.getAdStudioBrandKit,
  getAdStudioDemoAccess: orm.getAdStudioDemoAccess,
  getCurrentGrowthPilot: orm.getCurrentGrowthPilot,
  listAdStudioBriefs: orm.listAdStudioBriefs,
  updateAdStudioBriefDetails: orm.updateAdStudioBriefDetails,
  updateProjectDetails: orm.updateProjectDetails,
  saveAdStudioVoice: orm.saveAdStudioVoice,
  adStudioBriefInput: orm.adStudioBriefInput,
  ProjectModel: { init: orm.projectInit },
}));

vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined), adStudioRuntime: vi.fn(() => ({})) }));
vi.mock('./metering', () => ({ meteredCall: vi.fn(async (_ctx, _kind, _id, fn) => fn()) }));
vi.mock('./brand', () => ({ fillAdStudioBrandFromSite: vi.fn(async () => undefined) }));
vi.mock('./growth-pilot', () => ({ readGrowthSite: vi.fn() }));

import { fillAdStudioBrandFromSite } from './brand';
import { readGrowthSite } from './growth-pilot';
import { enrichProjectAndBriefFromSite, resolveBriefTargetSiteUrl } from './site-enrich';

const EMPTY_BRAND = { brandName: '', slogan: '', toneOfVoice: '', avoidWords: [], colors: [], logo: null, lastChangedOn: null };

function makeBrief(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    organization_id: 'o1',
    project_id: 'p1',
    name: 'Launch',
    objective: 'More trials',
    product_description: 'Short desc',
    landing_page_url: null,
    video_format: 'vertical',
    language: 'he',
    target_seconds: 15,
    narrator_voice: null,
    narration_mode: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orm.getAdStudioBrandKit.mockResolvedValue(EMPTY_BRAND);
  orm.getCurrentGrowthPilot.mockResolvedValue(null);
  orm.getAdStudioDemoAccess.mockResolvedValue(null);
  orm.listAdStudioBriefs.mockResolvedValue([]);
  orm.projectInit.mockResolvedValue({ id: 'p1', organization_id: 'o1', name: 'EasySign', currency: '', timezone: '', vertical: '' });
});

describe('resolveBriefTargetSiteUrl', () => {
  it('prefers explicit URL -> brief -> Growth Pilot -> Demo Access -> sibling brief', async () => {
    expect(await resolveBriefTargetSiteUrl('o1', 'p1', { id: 'b1', landing_page_url: 'https://brief.example' }, 'https://explicit.example')).toBe('https://explicit.example/');
    expect(await resolveBriefTargetSiteUrl('o1', 'p1', { id: 'b1', landing_page_url: 'https://brief.example' })).toBe('https://brief.example/');

    orm.getCurrentGrowthPilot.mockResolvedValueOnce({ site_url: 'https://pilot.example' });
    expect(await resolveBriefTargetSiteUrl('o1', 'p1', { id: 'b1', landing_page_url: null })).toBe('https://pilot.example/');

    orm.getAdStudioDemoAccess.mockResolvedValueOnce({ publicSite: false, loginUrl: 'https://app.demo.example/login' });
    expect(await resolveBriefTargetSiteUrl('o1', 'p1', { id: 'b1', landing_page_url: null })).toBe('https://app.demo.example');

    orm.listAdStudioBriefs.mockResolvedValueOnce([{ id: 'b2', landing_page_url: 'https://sibling.example' }]);
    expect(await resolveBriefTargetSiteUrl('o1', 'p1', { id: 'b1', landing_page_url: null })).toBe('https://sibling.example/');
  });
});

describe('enrichProjectAndBriefFromSite', () => {
  it('fills missing brand, project, and brief fields from the resolved site without overwriting existing ones', async () => {
    orm.getAdStudioBrief.mockResolvedValue(makeBrief({ landing_page_url: 'https://easysign.example' }));
    orm.getAdStudioBrandKit.mockResolvedValue({ ...EMPTY_BRAND, brandName: 'My Custom Name' });
    orm.projectInit.mockResolvedValue({ id: 'p1', organization_id: 'o1', name: 'EasySign', currency: 'USD', timezone: '', vertical: '' });
    vi.mocked(readGrowthSite).mockResolvedValue({
      status: 'ok',
      pages: [{ url: 'https://easysign.example', title: 'EasySign', description: 'Digital signatures', headings: [], text: 'Sign fast via WhatsApp.' }],
      logoUrl: 'https://easysign.example/logo.png',
      colors: ['#3b82f6'],
    });
    const llm = {
      provider: 'gemini' as const,
      model: 'm',
      generateJson: vi.fn(async () => ({
        brandName: 'Site Name',
        slogan: 'Sign in seconds',
        toneOfVoice: 'Direct and helpful',
        colors: ['#10b981'],
        productDescription: 'EasySign lets Israeli businesses send and sign contracts in seconds via WhatsApp.',
        objective: 'Generate free trial signups from small businesses',
        currency: 'ILS',
        timezone: 'Asia/Jerusalem',
        vertical: 'Legal Tech',
        voicePreset: 'woman_warm',
        language: 'he',
      })),
    };

    const res = await enrichProjectAndBriefFromSite({
      organizationId: 'o1',
      projectId: 'p1',
      briefId: 'b1',
      actorId: 'u1',
      llm,
    });

    expect(res.status).toBe('done');
    expect(vi.mocked(fillAdStudioBrandFromSite)).toHaveBeenCalledWith(
      { organizationId: 'o1', projectId: 'p1', actorId: 'u1' },
      expect.objectContaining({
        businessName: undefined, // Existing brandName preserved
        slogan: 'Sign in seconds',
        toneOfVoice: 'Direct and helpful',
        colors: ['#3b82f6', '#10b981'],
        logoUrl: 'https://easysign.example/logo.png',
      }),
      expect.any(Object),
    );
    expect(orm.updateProjectDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        vertical: 'Legal Tech',
        timezone: 'Asia/Jerusalem',
        actorUserId: 'u1',
      }),
    );
    // Existing USD currency was NOT overwritten
    expect(orm.updateProjectDetails.mock.calls[0][0].currency).toBeUndefined();
    expect(orm.updateAdStudioBriefDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          objective: 'Generate free trial signups from small businesses',
          productDescription: 'EasySign lets Israeli businesses send and sign contracts in seconds via WhatsApp.',
        }),
      }),
    );
    expect(orm.saveAdStudioVoice).toHaveBeenCalledWith(expect.objectContaining({ voice: { preset: 'woman_warm' } }));
  });

  it('skips cleanly when no target site URL is available or when everything is already populated', async () => {
    orm.getAdStudioBrief.mockResolvedValue(makeBrief());
    const llm = { provider: 'gemini' as const, model: 'm', generateJson: vi.fn() };
    const noUrl = await enrichProjectAndBriefFromSite({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', llm });
    expect(noUrl).toEqual({ status: 'skipped', reason: 'no_site_url', siteUrl: null, filled: [] });

    orm.getAdStudioBrief.mockResolvedValue(
      makeBrief({
        landing_page_url: 'https://easysign.example',
        objective: 'Drive qualified demo requests from law firms',
        product_description: 'Digital signature platform designed for law firms and businesses in Israel.',
        narrator_voice: { preset: 'man_warm' },
      }),
    );
    orm.getAdStudioBrandKit.mockResolvedValue({
      brandName: 'EasySign',
      slogan: 'Sign anywhere',
      toneOfVoice: 'Direct',
      avoidWords: [],
      colors: ['#1e40af'],
      logo: { path: 'logo.png', mimeType: 'image/png' },
      lastChangedOn: null,
    });
    orm.projectInit.mockResolvedValue({ id: 'p1', organization_id: 'o1', name: 'EasySign', currency: 'ILS', timezone: 'Asia/Jerusalem', vertical: 'SaaS' });
    const done = await enrichProjectAndBriefFromSite({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', llm });
    expect(done).toEqual({ status: 'skipped', reason: 'already_done', siteUrl: 'https://easysign.example/', filled: [] });
    expect(readGrowthSite).not.toHaveBeenCalled();
    expect(llm.generateJson).not.toHaveBeenCalled();
  });

  it('saves landing_page_url even if fetching the site fails, and skips non-blockingly', async () => {
    orm.getAdStudioBrief.mockResolvedValue(makeBrief());
    vi.mocked(readGrowthSite).mockResolvedValue({ status: 'unavailable', reason: 'unreachable' });
    const llm = { provider: 'gemini' as const, model: 'm', generateJson: vi.fn() };
    const res = await enrichProjectAndBriefFromSite({
      organizationId: 'o1',
      projectId: 'p1',
      briefId: 'b1',
      actorId: 'u1',
      siteUrl: 'https://easysign.example',
      llm,
    });
    expect(res).toEqual({ status: 'skipped', reason: 'site_unreachable', siteUrl: 'https://easysign.example/', filled: ['brief.landing_page_url'] });
    expect(orm.updateAdStudioBriefDetails).toHaveBeenCalledTimes(1);
    expect(llm.generateJson).not.toHaveBeenCalled();
  });
});
