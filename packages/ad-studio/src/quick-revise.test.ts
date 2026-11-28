// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  getAdStudioBrief: vi.fn(),
  getAdStudioBrandKit: vi.fn(),
  saveAdStudioCopy: vi.fn(),
  saveAdStudioSearchAd: vi.fn(),
  saveAdStudioSearchKeywords: vi.fn(),
  saveAdStudioVideoSettings: vi.fn(),
  adStudioNarrationMode: vi.fn(() => 'voiceover' as const),
  adStudioBriefInput: vi.fn((brief: Record<string, unknown>) => ({
    name: brief.name,
    objective: brief.objective,
    productDescription: brief.product_description,
    landingPageUrl: brief.landing_page_url ?? null,
    format: brief.video_format,
    language: brief.language,
    targetSeconds: brief.target_seconds,
  })),
  seq: 0,
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAdStudioBrief: orm.getAdStudioBrief,
  getAdStudioBrandKit: orm.getAdStudioBrandKit,
  saveAdStudioCopy: orm.saveAdStudioCopy,
  saveAdStudioSearchAd: orm.saveAdStudioSearchAd,
  saveAdStudioSearchKeywords: orm.saveAdStudioSearchKeywords,
  saveAdStudioVideoSettings: orm.saveAdStudioVideoSettings,
  adStudioNarrationMode: orm.adStudioNarrationMode,
  adStudioBriefInput: orm.adStudioBriefInput,
  newAdStudioSceneId: vi.fn(() => `new-id-${++orm.seq}`),
}));

vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));
vi.mock('./metering', () => ({ meteredCall: vi.fn(async (_ctx, _kind, _id, fn) => fn()) }));
vi.mock('./vocalize', () => ({ saveAdStudioScriptWithPronunciation: vi.fn(async (params) => ({ ...makeBrief(), scenes: params.scenes })) }));
vi.mock('./script-generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./script-generation')>();
  return { ...actual, generateAdStudioScript: vi.fn(async () => ({ ...makeBrief(), scenes: [{ id: 'g1', durationSeconds: 5, visualPrompt: 'Generated', voiceover: 'Hi', onScreenText: '' }] })) };
});
vi.mock('./image-pipeline', () => ({
  generateAdStudioImageConcepts: vi.fn(async () => ({ ...makeBrief() })),
  rewriteAdStudioImageConcept: vi.fn(async () => ({ ...makeBrief() })),
}));
vi.mock('./length-repair', () => ({ repairOverLength: vi.fn(async () => new Map()) }));

import { generateAdStudioImageConcepts, rewriteAdStudioImageConcept } from './image-pipeline';
import { generateAdStudioScript } from './script-generation';
import {
  reviseAdStudioImagesWithInstruction,
  reviseAdStudioScriptWithInstruction,
  reviseAdStudioSearchAdWithInstruction,
} from './quick-revise';
import { saveAdStudioScriptWithPronunciation } from './vocalize';

function makeBrief(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    organization_id: 'o1',
    project_id: 'p1',
    name: 'EasySign',
    objective: 'More signups',
    product_description: 'Digital signatures for businesses',
    landing_page_url: 'https://easysign.example',
    video_format: 'vertical',
    language: 'en',
    target_seconds: 15,
    scenes: [],
    image_concepts: [],
    search_ad: null,
    search_keywords: null,
    plan: null,
    plan_sources: null,
    video_settings: null,
    narration_mode: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orm.seq = 0;
  orm.getAdStudioBrandKit.mockResolvedValue({ brandName: 'EasySign', slogan: '', toneOfVoice: '', avoidWords: [], colors: [] });
  orm.saveAdStudioSearchAd.mockImplementation(async (p) => ({ ...makeBrief(), search_ad: p.ad }));
  orm.saveAdStudioSearchKeywords.mockImplementation(async (p) => ({ ...makeBrief(), search_keywords: p.keywords }));
});

describe('reviseAdStudioScriptWithInstruction', () => {
  it('saves the instruction into video settings and generates a new script when no scenes exist yet', async () => {
    orm.getAdStudioBrief.mockResolvedValue(makeBrief({ scenes: [] }));
    const llm = { provider: 'gemini' as const, model: 'm', generateJson: vi.fn() };
    await reviseAdStudioScriptWithInstruction({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', instruction: 'Use bright office lighting', llm });
    expect(orm.saveAdStudioVideoSettings).toHaveBeenCalledWith(expect.objectContaining({ settings: { instructions: 'Use bright office lighting' } }));
    expect(generateAdStudioScript).toHaveBeenCalledTimes(1);
  });

  it('preserves existing IDs for unchanged scenes and reassigns modified ones cleanly', async () => {
    orm.getAdStudioBrief.mockResolvedValue(
      makeBrief({
        scenes: [
          { id: 's-keep', durationSeconds: 5, visualPrompt: 'Lawyer signing', voiceover: 'Sign fast', onScreenText: '' },
          { id: 's-edit', durationSeconds: 5, visualPrompt: 'Old closing', voiceover: 'Old VO', onScreenText: '' },
        ],
      }),
    );
    const llm = {
      provider: 'gemini' as const,
      model: 'm',
      generateJson: vi.fn(async () => ({
        title: 'Revised',
        scenes: [
          { durationSeconds: 5, visualPrompt: 'Lawyer signing', voiceover: 'Sign fast', onScreenText: '' },
          { durationSeconds: 6, visualPrompt: 'New bright closing', voiceover: 'Try free today', onScreenText: 'Start' },
        ],
      })),
    };
    await reviseAdStudioScriptWithInstruction({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', instruction: 'Punchier ending', llm });
    const savedScenes = vi.mocked(saveAdStudioScriptWithPronunciation).mock.calls[0][0].scenes;
    expect(savedScenes[0].id).toBe('s-keep');
    expect(savedScenes[1].id).toBe('s-edit');
    expect(savedScenes[1].visualPrompt).toBe('New bright closing');
  });
});

describe('reviseAdStudioSearchAdWithInstruction', () => {
  it('revises search ad copy and keywords directly when the model returns both', async () => {
    orm.getAdStudioBrief.mockResolvedValue(makeBrief());
    const llm = {
      provider: 'gemini' as const,
      model: 'm',
      generateJson: vi.fn(async () => ({
        headlines: ['Sign via WhatsApp', 'Fast e-signatures', 'Legally binding'],
        descriptions: ['Send any contract in seconds.', 'Start your free trial today.'],
        path1: 'sign',
        path2: 'whatsapp',
        keywords: [{ text: 'sign via whatsapp', matchType: 'PHRASE' }],
        negatives: ['jobs'],
      })),
    };
    await reviseAdStudioSearchAdWithInstruction({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', instruction: 'Focus on WhatsApp', llm });
    expect(orm.saveAdStudioSearchAd).toHaveBeenCalledWith(expect.objectContaining({ ad: expect.objectContaining({ path2: 'whatsapp' }) }));
    expect(orm.saveAdStudioSearchKeywords).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: expect.objectContaining({
          keywords: [expect.objectContaining({ text: 'sign via whatsapp', matchType: 'PHRASE' })],
          negatives: ['jobs'],
        }),
      }),
    );
  });
});

describe('reviseAdStudioImagesWithInstruction', () => {
  it('rewrites a single concept, all concepts, or generates with instruction when empty', async () => {
    await reviseAdStudioImagesWithInstruction({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', conceptId: 'c1', instruction: 'Warmer colors', llm: {} as never });
    expect(rewriteAdStudioImageConcept).toHaveBeenCalledWith(expect.objectContaining({ conceptId: 'c1', instruction: 'Warmer colors' }));

    orm.getAdStudioBrief.mockResolvedValueOnce(makeBrief({ image_concepts: [] }));
    await reviseAdStudioImagesWithInstruction({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', instruction: 'Modern office', formats: ['square'], llm: {} as never });
    expect(generateAdStudioImageConcepts).toHaveBeenCalledWith(expect.objectContaining({ instruction: 'Modern office', formats: ['square'] }));

    orm.getAdStudioBrief.mockResolvedValueOnce(makeBrief({ image_concepts: [{ id: 'c1' }, { id: 'c2' }] }));
    await reviseAdStudioImagesWithInstruction({ organizationId: 'o1', projectId: 'p1', briefId: 'b1', actorId: 'u1', instruction: 'Add smile', llm: {} as never });
    expect(rewriteAdStudioImageConcept).toHaveBeenCalledTimes(3);
  });
});
