// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  acquireAdStudioRunLease: vi.fn(),
  getAdStudioBrief: vi.fn(),
  getAdStudioRun: vi.fn(),
  getAdStudioSettings: vi.fn(),
  listAdStudioClips: vi.fn(),
  listAdStudioImages: vi.fn(),
  listAdStudioVideos: vi.fn(),
  listEnvironmentsForProject: vi.fn(),
  saveAdStudioRunProgress: vi.fn(),
  saveAdStudioSearchKeywords: vi.fn(),
  startAdStudioRun: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  acquireAdStudioRunLease: orm.acquireAdStudioRunLease,
  getAdStudioBrief: orm.getAdStudioBrief,
  getAdStudioRun: orm.getAdStudioRun,
  getAdStudioSettings: orm.getAdStudioSettings,
  listAdStudioClips: orm.listAdStudioClips,
  listAdStudioImages: orm.listAdStudioImages,
  listAdStudioVideos: orm.listAdStudioVideos,
  listEnvironmentsForProject: orm.listEnvironmentsForProject,
  saveAdStudioRunProgress: orm.saveAdStudioRunProgress,
  saveAdStudioSearchKeywords: orm.saveAdStudioSearchKeywords,
  startAdStudioRun: orm.startAdStudioRun,
}));

vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));
vi.mock('./site-enrich', () => ({ enrichProjectAndBriefFromSite: vi.fn() }));
vi.mock('./search', () => ({
  suggestAdStudioKeywords: vi.fn(),
  writeAdStudioSearchAd: vi.fn(),
}));
vi.mock('./quick-revise', () => ({
  reviseAdStudioScriptWithInstruction: vi.fn(),
  reviseAdStudioSearchAdWithInstruction: vi.fn(),
  reviseAdStudioImagesWithInstruction: vi.fn(),
}));
vi.mock('./image-pipeline', () => ({
  generateAdStudioImageConcepts: vi.fn(),
  renderAdStudioConceptImage: vi.fn(),
  toAdStudioImageView: vi.fn((x) => x),
}));
vi.mock('./video-pipeline', () => ({
  advanceBriefVideo: vi.fn(),
  assembleBriefVideo: vi.fn(),
  startRenderAll: vi.fn(),
  startSceneRender: vi.fn(),
  toAdStudioClipView: vi.fn((x) => x),
  toAdStudioVideoView: vi.fn((x) => x),
}));

import { advanceAdStudioAutopilot } from './autopilot';
import { renderAdStudioConceptImage } from './image-pipeline';
import { reviseAdStudioImagesWithInstruction, reviseAdStudioScriptWithInstruction, reviseAdStudioSearchAdWithInstruction } from './quick-revise';
import { suggestAdStudioKeywords, writeAdStudioSearchAd } from './search';
import { enrichProjectAndBriefFromSite } from './site-enrich';

function makeRun(steps: { id: string; status?: string }[], options: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    organization_id: 'o1',
    project_id: 'p1',
    brief_id: 'b1',
    status: 'running',
    options: {
      plan: false,
      images: false,
      imageFormats: ['square', 'portrait'],
      video: false,
      environmentId: null,
      confirmPlan: false,
      ...options,
    },
    steps: steps.map((s) => ({
      id: s.id,
      status: s.status ?? 'pending',
      reason: null,
      progress: null,
      started_on: null,
      finished_on: null,
    })),
    started_by: 'u1',
    started_on: '2026-11-28T00:00:00.000Z',
    last_advanced_on: '2026-11-28T00:00:00.000Z',
    finished_on: null,
    plan_approved_on: null,
  };
}

const BRIEF = {
  id: 'b1',
  organization_id: 'o1',
  project_id: 'p1',
  name: 'EasySign',
  objective: 'Get trial signups',
  product_description: 'Digital signatures for businesses',
  landing_page_url: 'https://easysign.example',
  video_format: 'vertical',
  language: 'he',
  target_seconds: 15,
  scenes: [],
  image_concepts: [
    { id: 'c1', headline: 'H1', visualPrompt: 'V1', formats: ['square'] },
    { id: 'c2', headline: 'H2', visualPrompt: 'V2', formats: ['square'] },
  ],
  search_keywords: null,
  search_ad: null,
  plan: null,
  plan_sources: null,
};

const DEPS = {
  video: { omni: null, storage: {} as never },
  images: { images: vi.fn() as never, storage: {} as never },
  llm: { provider: 'gemini' as const, model: 'm', generateJson: vi.fn() },
  now: () => new Date('2026-11-28T01:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  orm.acquireAdStudioRunLease.mockResolvedValue('lease-1');
  orm.saveAdStudioRunProgress.mockImplementation(async (run) => run);
  orm.getAdStudioBrief.mockResolvedValue(BRIEF);
  orm.listAdStudioImages.mockResolvedValue([]);
});

describe('advanceAdStudioAutopilot targeted & AI revise steps', () => {
  it('runs site_enrich non-blockingly and proceeds to search_keywords and search_ad', async () => {
    const run = makeRun(
      [{ id: 'site_enrich' }, { id: 'search_keywords' }, { id: 'search_ad' }],
      { siteEnrich: true, search: true, target: 'search', siteUrl: 'https://easysign.example' },
    );
    orm.getAdStudioRun.mockResolvedValue(run);
    vi.mocked(enrichProjectAndBriefFromSite).mockResolvedValue({ status: 'done', reason: null, siteUrl: 'https://easysign.example', filled: ['brand.slogan'] });
    vi.mocked(suggestAdStudioKeywords).mockResolvedValue({
      keywords: { targeting: { country: 'IL', language: 'he' }, keywords: [{ text: 'sign pdf', matchType: 'PHRASE', avgMonthlySearches: 100, competition: 'LOW', lowTopOfPageBid: 1, highTopOfPageBid: 2 }], negatives: [] },
      researched: false,
      reason: null,
    });
    vi.mocked(writeAdStudioSearchAd).mockResolvedValue(BRIEF as never);

    await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(enrichProjectAndBriefFromSite).toHaveBeenCalledWith(expect.objectContaining({ siteUrl: 'https://easysign.example' }));
    expect(run.steps[0].status).toBe('done');

    await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(suggestAdStudioKeywords).toHaveBeenCalled();
    expect(orm.saveAdStudioSearchKeywords).toHaveBeenCalled();
    expect(run.steps[1].status).toBe('done');

    const finalRun = await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(writeAdStudioSearchAd).toHaveBeenCalled();
    expect(finalRun.status).toBe('done');
  });

  it('dispatches revise step by target (video, search, single image)', async () => {
    const videoRun = makeRun([{ id: 'revise' }], { target: 'video', video: true, instruction: 'Shorter intro' });
    orm.getAdStudioRun.mockResolvedValueOnce(videoRun).mockResolvedValueOnce(videoRun);
    await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(reviseAdStudioScriptWithInstruction).toHaveBeenCalledWith(expect.objectContaining({ instruction: 'Shorter intro' }));

    const searchRun = makeRun([{ id: 'revise' }], { target: 'search', search: true, instruction: 'Add free trial' });
    orm.getAdStudioRun.mockResolvedValueOnce(searchRun).mockResolvedValueOnce(searchRun);
    await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(reviseAdStudioSearchAdWithInstruction).toHaveBeenCalledWith(expect.objectContaining({ instruction: 'Add free trial' }));

    const imageRun = makeRun([{ id: 'revise' }, { id: 'images' }], { target: 'image', targetConceptId: 'c2', images: true, instruction: 'Blue sky' });
    orm.getAdStudioRun.mockResolvedValueOnce(imageRun).mockResolvedValueOnce(imageRun);
    await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(reviseAdStudioImagesWithInstruction).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'c2', instruction: 'Blue sky' }));

    // Next step (`images`) renders ONLY concept c2 when targetConceptId is set.
    orm.getAdStudioRun.mockResolvedValueOnce(imageRun).mockResolvedValueOnce(imageRun);
    await advanceAdStudioAutopilot({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', runId: 'run-1', actorId: 'u1' }, DEPS);
    expect(renderAdStudioConceptImage).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'c2', format: 'square' }), expect.any(Object));
  });
});
