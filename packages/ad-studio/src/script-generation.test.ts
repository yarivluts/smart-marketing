// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  getAdStudioBrief: vi.fn(),
  saveAdStudioCopy: vi.fn(),
  assertAdStudioQuota: vi.fn(),
  recordAdStudioUsage: vi.fn(),
}));
const vocalize = vi.hoisted(() => ({ saveAdStudioScriptWithPronunciation: vi.fn() }));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));
vi.mock('./vocalize', () => vocalize);
vi.mock('./brand', () => ({
  briefPromptInput: vi.fn(async (brief: { narration_mode?: string | null }) => ({
    name: 'Launch',
    objective: 'Signups, presented by our founder talking to camera',
    productDescription: 'E-signatures',
    landingPageUrl: null,
    format: 'vertical',
    language: 'en',
    targetSeconds: 20,
    narrationMode: brief.narration_mode ?? null,
  })),
}));

import type { AdStudioLlm } from './llm';
import { generateAdStudioScript, proposeAdStudioSceneRewrite } from './script-generation';

const BRIEF = { id: 'b1', organization_id: 'o', project_id: 'p', language: 'en', plan: null, plan_sources: null, video_copy: null, scenes: [], narration_mode: null, detected_narration_mode: null };

function llm(result: unknown): AdStudioLlm & { generateJson: ReturnType<typeof vi.fn> } {
  return { provider: 'anthropic', model: 'claude-test', generateJson: vi.fn(async () => result) } as never;
}

const scene = (voiceover: string, extra: object = {}) => ({ durationSeconds: 5, visualPrompt: 'A desk', voiceover, onScreenText: '', ...extra });
const ctx = (model: AdStudioLlm) => ({ organizationId: 'o', projectId: 'p', actorId: 'u', llm: model, briefId: 'b1' });

beforeEach(() => {
  vi.clearAllMocks();
  vocalize.saveAdStudioScriptWithPronunciation.mockImplementation(async (params: unknown) => params);
});

describe('narration mode in script writing', () => {
  it('asks the writer to read the mode from the brief when automatic, and stores what it read with the script', async () => {
    orm.getAdStudioBrief.mockResolvedValue(BRIEF);
    const model = llm({
      title: 'Launch',
      narrationMode: 'on_camera',
      scenes: [scene('Hi', { delivery: 'on_screen', speaker: 'the founder, a woman in her 40s' }), scene('', { delivery: 'nonsense' })],
    });
    await generateAdStudioScript(ctx(model));
    expect(model.generateJson.mock.calls[0][0].system).toContain('narrationMode: read the brief');
    const saved = vocalize.saveAdStudioScriptWithPronunciation.mock.calls[0][0];
    expect(saved.detectedNarrationMode).toBe('on_camera');
    expect(saved.scenes.map((entry: { delivery?: string; speaker?: string }) => [entry.delivery, entry.speaker])).toEqual([
      ['on_screen', 'the founder, a woman in her 40s'],
      [undefined, undefined],
    ]);
  });

  it('defaults an unclear answer to voice-over, and never replaces a mode the person chose', async () => {
    orm.getAdStudioBrief.mockResolvedValue(BRIEF);
    await generateAdStudioScript(ctx(llm({ title: 'Launch', narrationMode: 'presenter?', scenes: [scene('Hi')] })));
    expect(vocalize.saveAdStudioScriptWithPronunciation.mock.calls[0][0].detectedNarrationMode).toBe('voiceover');

    orm.getAdStudioBrief.mockResolvedValue({ ...BRIEF, narration_mode: 'voiceover' });
    const model = llm({ title: 'Launch', narrationMode: 'on_camera', scenes: [scene('Hi')] });
    await generateAdStudioScript(ctx(model));
    expect(model.generateJson.mock.calls[0][0].system).toContain('Narration mode voiceover');
    expect(vocalize.saveAdStudioScriptWithPronunciation.mock.calls[1][0].detectedNarrationMode).toBeUndefined();
  });

  it('makes a rewritten scene follow the mode: one presenter on camera, nobody on screen in a voice-over ad', async () => {
    const scenes = [
      { id: 's1', ...scene('Hi', { delivery: 'on_screen', speaker: 'the founder' }) },
      { id: 's2', ...scene('More') },
    ];
    orm.getAdStudioBrief.mockResolvedValue({ ...BRIEF, narration_mode: 'on_camera', scenes });
    const onCamera = llm(scene('Shorter', { delivery: 'voiceover', speaker: '' }));
    const proposal = await proposeAdStudioSceneRewrite({ ...ctx(onCamera), sceneId: 's2', instruction: 'Shorter' });
    expect(proposal).toMatchObject({ id: 's2', voiceover: 'Shorter', delivery: 'on_screen', speaker: 'the founder' });
    expect(onCamera.generateJson.mock.calls[0][0].system).toContain('Narration mode on_camera');

    orm.getAdStudioBrief.mockResolvedValue({ ...BRIEF, narration_mode: 'voiceover', scenes });
    const voiceover = await proposeAdStudioSceneRewrite({ ...ctx(llm(scene('Talk', { delivery: 'on_screen', speaker: 'a man' }))), sceneId: 's2', instruction: 'Let him talk' });
    expect(voiceover.delivery).toBeUndefined();
    expect(voiceover.speaker).toBeUndefined();
  });
});
