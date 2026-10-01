import { describe, expect, it } from 'vitest';
import {
  buildVocalizePrompt,
  isHebrewLanguage,
  isUsablePronunciation,
  needsPronunciation,
  reconcilePronunciations,
  spokenNarration,
  stripHebrewPoints,
} from './pronunciation';
import { AD_STUDIO_PRONUNCIATION_MAX, fitAdStudioScenes, validateAdStudioScenes, type AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';

// Hebrew is written as escapes: no Hebrew characters in code files.
/** "shalom" without vowels. */
const PLAIN = 'שלום';
/** The same word with nikud (shin+shin dot+qamats, lamed, holam male, final mem). */
const VOCALIZED = 'שָׁלוֹם';

function scene(overrides: Partial<AdStudioScene> = {}): AdStudioScene {
  return { id: 's1', durationSeconds: 5, visualPrompt: 'A lawyer smiles at her phone', voiceover: PLAIN, onScreenText: '', ...overrides };
}

const HE = { format: 'vertical' as const, language: 'he', productDescription: 'E-signatures for lawyers' };

describe('Hebrew pronunciation helpers', () => {
  it('recognises Hebrew language codes and strips only the vowel points', () => {
    expect(['he', 'HE', 'he-IL', 'iw'].map(isHebrewLanguage)).toEqual([true, true, true, true]);
    expect(['en', 'hebrew', ''].map(isHebrewLanguage)).toEqual([false, false, false]);
    expect(stripHebrewPoints(VOCALIZED)).toBe(PLAIN);
  });

  it('speaks the pronunciation when there is one, else the voiceover', () => {
    expect(spokenNarration(scene())).toBe(PLAIN);
    expect(spokenNarration(scene({ pronunciation: `  ${VOCALIZED}  ` }))).toBe(VOCALIZED);
    expect(spokenNarration(scene({ pronunciation: '   ' }))).toBe(PLAIN);
  });

  it('asks for a pronunciation only for Hebrew narration that has none', () => {
    expect(needsPronunciation(scene(), 'he')).toBe(true);
    expect(needsPronunciation(scene({ pronunciation: VOCALIZED }), 'he')).toBe(false);
    expect(needsPronunciation(scene({ voiceover: '  ' }), 'he')).toBe(false);
    expect(needsPronunciation(scene({ voiceover: 'Sign faster' }), 'en')).toBe(false);
  });

  it('drops a pronunciation that belongs to old words, keeps one the person edited with the words', () => {
    const before = [scene({ pronunciation: VOCALIZED }), scene({ id: 's2', pronunciation: VOCALIZED })];
    const next = reconcilePronunciations(before, [
      // Narration changed, pronunciation sent back as it was: stale.
      scene({ voiceover: `${PLAIN} ${PLAIN}`, pronunciation: VOCALIZED }),
      // Narration and pronunciation changed together: the person's own.
      scene({ id: 's2', voiceover: `${PLAIN} ${PLAIN}`, pronunciation: `${VOCALIZED} ${VOCALIZED}` }),
      // Narration emptied: nothing to pronounce.
      scene({ id: 's3', voiceover: '', pronunciation: VOCALIZED }),
      // A new scene with an empty pronunciation: the key is removed, not stored empty.
      scene({ id: 's4', pronunciation: '  ' }),
      // Unchanged narration keeps its pronunciation.
      scene({ id: 's1b', pronunciation: ` ${VOCALIZED} ` }),
    ]);
    expect(next.map((entry) => entry.pronunciation)).toEqual([undefined, `${VOCALIZED} ${VOCALIZED}`, undefined, undefined, VOCALIZED]);
    expect(next.every((entry) => entry.pronunciation !== undefined || !('pronunciation' in entry))).toBe(true);
  });

  it('accepts a vocalized Hebrew line and rejects empty, foreign or oversized answers', () => {
    expect(isUsablePronunciation(VOCALIZED)).toBe(true);
    expect(isUsablePronunciation(`GrowthOS ${VOCALIZED}`)).toBe(true);
    expect(isUsablePronunciation('   ')).toBe(false);
    expect(isUsablePronunciation('Sign faster')).toBe(false);
    expect(isUsablePronunciation(VOCALIZED.repeat(200))).toBe(false);
  });

  it('asks the vocalizer to keep the words and spell numbers out with agreeing gender', () => {
    const prompt = buildVocalizePrompt([{ id: 's1', text: `  ${PLAIN}\n2 ` }]);
    expect(prompt.system).toContain('full nikud');
    expect(prompt.system).toContain('Keep the exact words and their order');
    expect(prompt.system).toContain('grammatical gender');
    expect(JSON.parse(prompt.user.split('\n')[1])).toEqual([{ id: 's1', text: `${PLAIN} 2` }]);
  });
});

describe('pronunciation in the scene prompt, fingerprint and rules', () => {
  it('has the narrator read the vocalized line exactly, and the plain line as before without one', () => {
    const plain = buildScenePrompt(scene(), HE);
    expect(plain).toContain(`says, in Hebrew: "${PLAIN}"`);
    expect(plain).not.toContain('nikud');
    const vocalized = buildScenePrompt(scene({ pronunciation: VOCALIZED }), HE);
    expect(vocalized).toContain('full nikud vowel marks');
    expect(vocalized).toContain(`"${VOCALIZED}"`);
    expect(vocalized).not.toContain(`"${PLAIN}"`);
    expect(vocalized).toContain('without repeating or stuttering');
  });

  it('keeps every existing fingerprint and changes it once a pronunciation is added or edited', () => {
    const base = sceneFingerprint(scene(), HE);
    expect(sceneFingerprint(scene({ pronunciation: '' }), HE)).toBe(base);
    const withNikud = sceneFingerprint(scene({ pronunciation: VOCALIZED }), HE);
    expect(withNikud).not.toBe(base);
    expect(sceneFingerprint(scene({ pronunciation: `${VOCALIZED} ` }), HE)).toBe(withNikud);
    expect(sceneFingerprint(scene({ pronunciation: `${VOCALIZED} ${VOCALIZED}` }), HE)).not.toBe(withNikud);
  });

  it('keeps a trimmed pronunciation when fitting a generated script, and stores no empty one', () => {
    const [kept, none] = fitAdStudioScenes([scene({ pronunciation: ` ${VOCALIZED} ` }), scene({ id: 's2', pronunciation: '' })], () => 'new');
    expect(kept.pronunciation).toBe(VOCALIZED);
    expect('pronunciation' in none).toBe(false);
  });

  it('rejects a pronunciation longer than the limit', () => {
    expect(validateAdStudioScenes([scene({ pronunciation: 'x'.repeat(AD_STUDIO_PRONUNCIATION_MAX + 1) })])).toEqual([{ code: 'pronunciation_too_long', scene: 1 }]);
    expect(validateAdStudioScenes([scene({ pronunciation: VOCALIZED })])).toEqual([]);
  });
});
