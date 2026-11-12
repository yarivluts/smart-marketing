import { describe, expect, it } from 'vitest';
import {
  buildVocalizeCheckPrompt,
  buildVocalizePrompt,
  chooseVerifiedPronunciation,
  isFaithfulPronunciation,
  isHebrewLanguage,
  isUsablePronunciation,
  pronunciationCoverage,
  sameNarrationSkeleton,
  needsPronunciation,
  reconcilePronunciations,
  spokenNarration,
  stripHebrewPoints,
} from './pronunciation';
import { AD_STUDIO_PRONUNCIATION_MAX, fitAdStudioScenes, validateAdStudioScenes, type AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';

// Hebrew is written as escapes: no Hebrew characters in code files.
/** "shalom" without vowels. */
const PLAIN = '\u05e9\u05dc\u05d5\u05dd';
/** The same word with nikud (shin+shin dot+qamats, lamed, holam male, final mem). */
const VOCALIZED = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';

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

// "Digital signature for lawyers", plain and with full nikud.
const LINE = '\u05d7\u05ea\u05d9\u05de\u05d4 \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u05ea \u05dc\u05e2\u05d5\u05e8\u05db\u05d9 \u05d3\u05d9\u05df';
const LINE_VOCALIZED =
  '\u05d7\u05b2\u05ea\u05b4\u05d9\u05de\u05b8\u05d4 \u05d3\u05b4\u05bc\u05d9\u05d2\u05b4\u05d9\u05d8\u05b8\u05dc\u05b4\u05d9\u05ea \u05dc\u05b0\u05e2\u05d5\u05b9\u05e8\u05b0\u05db\u05b5\u05d9 \u05d3\u05b4\u05bc\u05d9\u05df';
// The same first two words, then a different word ("for managers"): a vocalizer that changed the line.
const LINE_CHANGED = '\u05d7\u05b2\u05ea\u05b4\u05d9\u05de\u05b8\u05d4 \u05d3\u05b4\u05bc\u05d9\u05d2\u05b4\u05d9\u05d8\u05b8\u05dc\u05b4\u05d9\u05ea \u05dc\u05b4\u05de\u05b0\u05e0\u05b7\u05d4\u05b2\u05dc\u05b4\u05d9\u05dd';
// "5 reasons to sign today": the digit is written out as a word ("five") in the vocalized line.
const NUMBER_LINE = '5 \u05e1\u05d9\u05d1\u05d5\u05ea \u05dc\u05d7\u05ea\u05d5\u05dd \u05d4\u05d9\u05d5\u05dd';
const NUMBER_VOCALIZED = '\u05d7\u05b8\u05de\u05b5\u05e9\u05c1 \u05e1\u05b4\u05d9\u05d1\u05bc\u05d5\u05b9\u05ea \u05dc\u05b7\u05d7\u05b0\u05ea\u05bc\u05d5\u05b9\u05dd \u05d4\u05b7\u05d9\u05bc\u05d5\u05b9\u05dd';
// The same, with the vav of "to sign" dropped (defective spelling): a respelled word.
const NUMBER_RESPELLED = '\u05d7\u05b8\u05de\u05b5\u05e9\u05c1 \u05e1\u05b4\u05d9\u05d1\u05bc\u05d5\u05b9\u05ea \u05dc\u05b7\u05d7\u05b0\u05ea\u05b9\u05bc\u05dd \u05d4\u05b7\u05d9\u05bc\u05d5\u05b9\u05dd';
// "In 30 seconds" with a hyphenated prefix, and its vocalization ("in thirty seconds").
const PREFIX_LINE = '\u05d1-30 \u05e9\u05e0\u05d9\u05d5\u05ea';
const PREFIX_VOCALIZED = '\u05d1\u05b4\u05bc\u05e9\u05b0\u05c1\u05dc\u05d5\u05b9\u05e9\u05b4\u05c1\u05d9\u05dd \u05e9\u05b0\u05c1\u05e0\u05b4\u05d9\u05bc\u05d5\u05b9\u05ea';

describe('nikud verification guards', () => {
  it('measures how much of a line carries vowel marks where they are expected', () => {
    expect(pronunciationCoverage(LINE_VOCALIZED)).toBe(1);
    expect(pronunciationCoverage(NUMBER_VOCALIZED)).toBe(1);
    expect(pronunciationCoverage(LINE)).toBe(0);
    expect(pronunciationCoverage('GrowthOS')).toBe(1);
    // One vowel on the last letter is not a vocalized line.
    expect(isUsablePronunciation(`${PLAIN}\u05b8`)).toBe(false);
    // Half the words vocalized, half bare: rejected.
    expect(isUsablePronunciation(`${LINE_VOCALIZED.split(' ').slice(0, 2).join(' ')} ${LINE.split(' ').slice(2).join(' ')}`)).toBe(false);
    expect(isUsablePronunciation(LINE_VOCALIZED)).toBe(true);
  });

  it('keeps the consonant skeleton: same letters, final forms, spacing and punctuation folded', () => {
    expect(sameNarrationSkeleton(LINE, LINE_VOCALIZED)).toBe(true);
    expect(sameNarrationSkeleton(`${LINE}.`, `${LINE_VOCALIZED.replace(/ /g, '  ')}!`)).toBe(true);
    expect(sameNarrationSkeleton(`GrowthOS ${LINE}`, `growthos, ${LINE_VOCALIZED}`)).toBe(true);
    // A changed word, a dropped word and a respelled word are all refused.
    expect(sameNarrationSkeleton(LINE, LINE_CHANGED)).toBe(false);
    expect(sameNarrationSkeleton(LINE, LINE_VOCALIZED.split(' ').slice(0, 3).join(' '))).toBe(false);
    expect(sameNarrationSkeleton(NUMBER_LINE, NUMBER_RESPELLED)).toBe(false);
    // A brand name in Latin letters must stay.
    expect(sameNarrationSkeleton(`GrowthOS ${LINE}`, LINE_VOCALIZED)).toBe(false);
  });

  it('lets numbers and symbols become words, keeping a prefix glued to them', () => {
    expect(sameNarrationSkeleton(NUMBER_LINE, NUMBER_VOCALIZED)).toBe(true);
    expect(sameNarrationSkeleton(PREFIX_LINE, PREFIX_VOCALIZED)).toBe(true);
    // The number may not simply vanish.
    expect(sameNarrationSkeleton(NUMBER_LINE, NUMBER_VOCALIZED.split(' ').slice(1).join(' '))).toBe(false);
    // The prefix may not be dropped.
    expect(sameNarrationSkeleton(PREFIX_LINE, PREFIX_VOCALIZED.slice(3))).toBe(false);
  });

  it('keeps the checked line, falls back to the first one, then to none', () => {
    expect(isFaithfulPronunciation(LINE, ` ${LINE_VOCALIZED} `)).toBe(true);
    expect(isFaithfulPronunciation(LINE, null)).toBe(false);
    expect(chooseVerifiedPronunciation(LINE, LINE_VOCALIZED, ` ${LINE_VOCALIZED} `)).toBe(LINE_VOCALIZED);
    // The check changed a word: the first pass stands.
    expect(chooseVerifiedPronunciation(LINE, LINE_VOCALIZED, LINE_CHANGED)).toBe(LINE_VOCALIZED);
    // The check failed: the first pass stands.
    expect(chooseVerifiedPronunciation(LINE, LINE_VOCALIZED, undefined)).toBe(LINE_VOCALIZED);
    // The first pass was not vocalized; the check was.
    expect(chooseVerifiedPronunciation(LINE, LINE, LINE_VOCALIZED)).toBe(LINE_VOCALIZED);
    // Both wrong: the plain narration is spoken.
    expect(chooseVerifiedPronunciation(LINE, LINE_CHANGED, `${PLAIN}\u05b8`)).toBeUndefined();
  });

  it('asks the check to review word by word with the ad context and return a verdict per line', () => {
    const prompt = buildVocalizeCheckPrompt([{ id: 's1', text: ` ${LINE}\n`, pronunciation: LINE_VOCALIZED }], {
      businessName: 'EasySign',
      productDescription: 'E-signatures for lawyers',
      objective: 'Trial signups',
      audience: 'Small law firms',
    });
    for (const expected of ['word by word', 'construct-state', 'definite article', 'imperative versus infinitive', 'gender', 'Foreign names', 'verdict', 'never add or remove a vav or yod']) {
      expect(prompt.system).toContain(expected);
    }
    expect(prompt.user).toContain('Business: EasySign');
    expect(prompt.user).toContain('Product: E-signatures for lawyers');
    expect(prompt.user).toContain('Audience: Small law firms');
    expect(JSON.parse(prompt.user.split('\n').at(-1) as string)).toEqual([{ id: 's1', text: LINE, pronunciation: LINE_VOCALIZED }]);
    const bare = buildVocalizeCheckPrompt([], { productDescription: 'x'.repeat(1000) });
    expect(bare.user).not.toContain('Business:');
    expect(bare.user).not.toContain('Audience:');
    expect(bare.user.length).toBeLessThan(700);
    expect(buildVocalizePrompt([]).system).toContain('never add or remove a vav or yod');
  });
});

describe('pronunciation in the scene prompt, fingerprint and rules', () => {
  it('has the narrator read the vocalized line exactly, and the plain line as before without one', () => {
    // Only a person on camera speaks in the clip; a voice-over is spoken separately (see the speech narrator).
    const onCamera = (overrides: Partial<AdStudioScene> = {}) => scene({ delivery: 'on_screen', ...overrides });
    const plain = buildScenePrompt(onCamera(), HE);
    expect(plain).toContain(`says, in Hebrew: "${PLAIN}"`);
    expect(plain).not.toContain('nikud');
    // Every narration is asked not to stutter or repeat a word (the AI check caught one doing it).
    expect(plain).toContain('without repeating or stuttering');
    const vocalized = buildScenePrompt(onCamera({ pronunciation: VOCALIZED }), HE);
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
