// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  getAdStudioBrief: vi.fn(),
  getAdStudioBrandKit: vi.fn(),
  saveAdStudioScript: vi.fn(),
  assertAdStudioQuota: vi.fn(),
  recordAdStudioUsage: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));

import { AdStudioQuotaExceededError } from '@growthos/firebase-orm-models';
import type { AdStudioScene } from '@growthos/shared';
import type { AdStudioLlm } from './llm';
import { saveAdStudioScriptWithPronunciation, vocalizeAdStudioScenes, vocalizeNarrationText } from './vocalize';

// Hebrew is written as escapes: no Hebrew characters in code files.
// "Digital signature for lawyers", plain, with full nikud, and with one vowel changed (a correction).
const LINE = '\u05d7\u05ea\u05d9\u05de\u05d4 \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u05ea \u05dc\u05e2\u05d5\u05e8\u05db\u05d9 \u05d3\u05d9\u05df';
const FIRST =
  '\u05d7\u05b2\u05ea\u05b4\u05d9\u05de\u05b8\u05d4 \u05d3\u05b4\u05bc\u05d9\u05d2\u05b4\u05d9\u05d8\u05b8\u05dc\u05b4\u05d9\u05ea \u05dc\u05b0\u05e2\u05d5\u05b9\u05e8\u05b0\u05db\u05b5\u05d9 \u05d3\u05b4\u05bc\u05d9\u05df';
const CORRECTED =
  '\u05d7\u05b2\u05ea\u05b4\u05d9\u05de\u05b8\u05d4 \u05d3\u05b4\u05bc\u05d9\u05d2\u05b4\u05d9\u05d8\u05b8\u05dc\u05b4\u05d9\u05ea \u05dc\u05b8\u05e2\u05d5\u05b9\u05e8\u05b0\u05db\u05b5\u05d9 \u05d3\u05b4\u05bc\u05d9\u05df';
// The checker swapped the last word for another ("for managers"): a different line.
const REWORDED = '\u05d7\u05b2\u05ea\u05b4\u05d9\u05de\u05b8\u05d4 \u05d3\u05b4\u05bc\u05d9\u05d2\u05b4\u05d9\u05d8\u05b8\u05dc\u05b4\u05d9\u05ea \u05dc\u05b4\u05de\u05b0\u05e0\u05b7\u05d4\u05b2\u05dc\u05b4\u05d9\u05dd';

const BRIEF = { id: 'b1', organization_id: 'o', project_id: 'p', language: 'he', product_description: 'E-signatures for lawyers', objective: 'Trial signups', plan: null, plan_sources: null, scenes: [] };

type Answer = unknown | Error;

/** A text model that answers the vocalizer, then the check, in order. */
function llm(...answers: Answer[]): AdStudioLlm & { generateJson: ReturnType<typeof vi.fn> } {
  const queue = [...answers];
  return {
    provider: 'gemini',
    model: 'gemini-test',
    generateJson: vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
  } as never;
}

const first = (pronunciation: string, id = 's1') => ({ lines: [{ id, pronunciation }] });
const check = (pronunciation: string, verdict = 'fixed', id = 's1') => ({ lines: [{ id, verdict, pronunciation }] });
const ctx = (model: AdStudioLlm) => ({ organizationId: 'o', projectId: 'p', actorId: 'u', llm: model, briefId: 'b1' });
const SCENES: AdStudioScene[] = [{ id: 's1', durationSeconds: 5, visualPrompt: 'A desk', voiceover: LINE, onScreenText: '' }];
const CONTEXT = { businessName: 'EasySign', productDescription: 'E-signatures for lawyers', objective: 'Trial signups', audience: null };

function usage(kind: string) {
  return orm.recordAdStudioUsage.mock.calls.map(([row]) => row).filter((row) => row.kind === kind);
}

beforeEach(() => {
  vi.clearAllMocks();
  orm.assertAdStudioQuota.mockReset().mockResolvedValue(undefined);
  orm.getAdStudioBrief.mockResolvedValue(BRIEF);
  orm.getAdStudioBrandKit.mockResolvedValue({ brandName: 'EasySign' });
  orm.saveAdStudioScript.mockImplementation(async (params: { scenes: AdStudioScene[] }) => ({ ...BRIEF, scenes: params.scenes }));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('vocalizing with an AI check', () => {
  it('runs the vocalizer, then an independent check at higher effort with the ad context, and keeps the correction', async () => {
    const model = llm(first(FIRST), check(CORRECTED));
    const result = await vocalizeAdStudioScenes({ ...ctx(model), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(result.scenes[0].pronunciation).toBe(CORRECTED);
    expect(result.vocalized).toBe(1);
    const [vocalizeCall, checkCall] = model.generateJson.mock.calls.map(([request]) => request);
    expect(vocalizeCall.effort).toBe('medium');
    expect(checkCall.effort).toBe('high');
    expect(checkCall.system).toContain('word by word');
    expect(checkCall.user).toContain('Business: EasySign');
    expect(checkCall.user).toContain(FIRST);
    // Both calls are metered, each as its own kind.
    expect(usage('vocalize')).toEqual([expect.objectContaining({ outcome: 'succeeded', units: 1 })]);
    expect(usage('vocalize_check')).toEqual([expect.objectContaining({ outcome: 'succeeded', units: 1, briefId: 'b1' })]);
    expect(orm.assertAdStudioQuota).toHaveBeenCalledWith(expect.objectContaining({ kind: 'vocalize_check', units: 1 }));
  });

  it('keeps the first vocalization when the check is ok with it', async () => {
    const result = await vocalizeAdStudioScenes({ ...ctx(llm(first(FIRST), check(FIRST, 'ok'))), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(result.scenes[0].pronunciation).toBe(FIRST);
  });

  it('rejects a check that changed the words and keeps the first vocalization', async () => {
    const result = await vocalizeAdStudioScenes({ ...ctx(llm(first(FIRST), check(REWORDED))), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(result.scenes[0].pronunciation).toBe(FIRST);
  });

  it('uses the check when the first answer was not vocalized, and speaks the plain line when both fail', async () => {
    const fixed = await vocalizeAdStudioScenes({ ...ctx(llm(first(LINE), check(FIRST))), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(fixed.scenes[0].pronunciation).toBe(FIRST);
    const neither = await vocalizeAdStudioScenes({ ...ctx(llm(first(REWORDED), check(LINE))), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(neither.scenes[0].pronunciation).toBeUndefined();
    expect(neither.vocalized).toBe(0);
  });

  it('falls back to the first vocalization when the check fails or is over the limit', async () => {
    const failed = await vocalizeAdStudioScenes({ ...ctx(llm(first(FIRST), new Error('provider down'))), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(failed.scenes[0].pronunciation).toBe(FIRST);
    expect(usage('vocalize_check')).toEqual([expect.objectContaining({ outcome: 'failed' })]);

    orm.assertAdStudioQuota.mockImplementation(async ({ kind }: { kind: string }) => {
      if (kind === 'vocalize_check') throw new AdStudioQuotaExceededError('text', 50, 50);
    });
    const model = llm(first(FIRST));
    const limited = await vocalizeAdStudioScenes({ ...ctx(model), language: 'he', scenes: SCENES, context: CONTEXT });
    expect(limited.scenes[0].pronunciation).toBe(FIRST);
    // Refused before the call: the provider is never asked.
    expect(model.generateJson).toHaveBeenCalledTimes(1);
  });

  it('checks the editor\'s "add nikud" result too, and refuses when nothing faithful came back', async () => {
    const model = llm(first(FIRST, 'line'), check(CORRECTED, 'fixed', 'line'));
    await expect(vocalizeNarrationText({ ...ctx(model), text: `  ${LINE} ` })).resolves.toBe(CORRECTED);
    expect(model.generateJson.mock.calls[1][0].user).toContain('Product: E-signatures for lawyers');
    expect(usage('vocalize_check')).toHaveLength(1);
    await expect(vocalizeNarrationText({ ...ctx(llm(first(REWORDED, 'line'), check(REWORDED, 'fixed', 'line'))), text: LINE })).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('re-vocalizes and re-checks a line whose words changed, and saves without nikud when vocalizing fails', async () => {
    orm.getAdStudioBrief.mockResolvedValue({ ...BRIEF, scenes: [{ ...SCENES[0], voiceover: 'old words', pronunciation: 'old nikud' }] });
    const model = llm(first(FIRST), check(CORRECTED));
    // The narration changed and the old pronunciation came back unchanged: it is dropped and redone.
    const saved = await saveAdStudioScriptWithPronunciation({ ...ctx(model), scenes: [{ ...SCENES[0], pronunciation: 'old nikud' }], llm: model });
    expect(saved.scenes[0].pronunciation).toBe(CORRECTED);
    expect(model.generateJson).toHaveBeenCalledTimes(2);

    const broken = llm(new Error('provider down'));
    const plain = await saveAdStudioScriptWithPronunciation({ ...ctx(broken), scenes: SCENES, llm: broken });
    expect(plain.scenes[0].pronunciation).toBeUndefined();
    expect(broken.generateJson).toHaveBeenCalledTimes(1);
  });
});
