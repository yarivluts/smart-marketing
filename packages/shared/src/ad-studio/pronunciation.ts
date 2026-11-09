import type { AdStudioPrompt } from './prompts';
import { AD_STUDIO_PRONUNCIATION_MAX, type AdStudioScene } from './scenes';

/**
 * How the narrator says a scene's voiceover (KAN-239). Hebrew is written without vowels, so a video
 * model that speaks it has to guess the pronunciation and the grammar of numbers - and guesses wrong
 * often enough to embarrass an ad. Each scene may therefore carry a `pronunciation`: the same words
 * with full nikud (vowel points) and every number, symbol and abbreviation written out as words.
 * When present it is what the model is asked to say; the voiceover stays the readable script.
 * Pure, so the routes, the MCP tools, the editor and the tests share one definition.
 */

/** Hebrew cantillation marks and vowel points (nikud), U+0591-U+05C7. */
const HEBREW_POINTS = /[\u0591-\u05c7]/g;
const HEBREW_LETTER = /[\u05d0-\u05ea]/;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** True for Hebrew ad languages ("he", "he-IL", and the legacy "iw"). */
export function isHebrewLanguage(code: string): boolean {
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  return base === 'he' || base === 'iw';
}

/** The text without Hebrew vowel points, to compare a vocalized line with the plain one. */
export function stripHebrewPoints(text: string): string {
  return text.replace(HEBREW_POINTS, '');
}

/** What the narrator is asked to say: the pronunciation when the scene has one, else the voiceover. */
export function spokenNarration(scene: Pick<AdStudioScene, 'voiceover' | 'pronunciation'>): string {
  return oneLine(scene.pronunciation ?? '') || oneLine(scene.voiceover);
}

/** A Hebrew scene with narration but no pronunciation yet - the ones the vocalizer fills in. */
export function needsPronunciation(scene: Pick<AdStudioScene, 'voiceover' | 'pronunciation'>, language: string): boolean {
  return isHebrewLanguage(language) && scene.voiceover.trim().length > 0 && (scene.pronunciation ?? '').trim().length === 0;
}

/**
 * Keeps a scene's pronunciation only while it still belongs to its narration. A pronunciation is
 * dropped when the narration is now empty, or when the narration changed but the pronunciation was
 * sent back unchanged (it vocalizes the old words). A pronunciation the person edited together with
 * the narration is theirs and is kept. Empty pronunciations are removed rather than stored.
 */
export function reconcilePronunciations(previous: readonly Pick<AdStudioScene, 'id' | 'voiceover' | 'pronunciation'>[], next: readonly AdStudioScene[]): AdStudioScene[] {
  const before = new Map(previous.map((scene) => [scene.id, scene]));
  return next.map((scene) => {
    const { pronunciation: raw, ...rest } = scene;
    const pronunciation = (raw ?? '').trim();
    if (!pronunciation || !scene.voiceover.trim()) return rest;
    const old = before.get(scene.id);
    const narrationChanged = old !== undefined && oneLine(old.voiceover) !== oneLine(scene.voiceover);
    if (narrationChanged && pronunciation === (old.pronunciation ?? '').trim()) return rest;
    return { ...rest, pronunciation };
  });
}

/** Vowel points, dagesh and shin/sin dots - the marks that say how a letter is read. */
const HEBREW_VOWEL_MARK = /[ְ-ׇֽֿׁׂׅׄ]/;
/** Letters that are often silent or carry their vowel on the next letter (alef, he, vav, yod). */
const QUIET_LETTERS = new Set(['א', 'ה', 'ו', 'י']);
const VAV = 'ו';
/** Below this share of marked letters, a line is not vocalized well enough to guide a speaker. */
export const AD_STUDIO_PRONUNCIATION_MIN_COVERAGE = 0.85;

/**
 * The share of Hebrew letters that carry a vowel mark where one is expected (0-1; 1 for a line with
 * no Hebrew). Letters that are correctly left bare in full nikud are not counted: the last letter of a
 * word, a silent or vowel letter (alef, he, vav, yod) without a mark, and a letter whose vowel sits
 * on the vav after it (holam male, shuruk).
 */
export function pronunciationCoverage(text: string): number {
  let expected = 0;
  let marked = 0;
  for (const word of text.match(/[א-ת֑-ׇ]+/g) ?? []) {
    const letters: { letter: string; marks: string }[] = [];
    for (const char of word) {
      if (HEBREW_LETTER.test(char)) letters.push({ letter: char, marks: '' });
      else if (letters.length) letters[letters.length - 1].marks += char;
    }
    letters.forEach(({ letter, marks }, index) => {
      const pointed = HEBREW_VOWEL_MARK.test(marks);
      const next = letters[index + 1];
      const vowelOnNextVav = next?.letter === VAV && HEBREW_VOWEL_MARK.test(next.marks);
      if (!pointed && (index === letters.length - 1 || QUIET_LETTERS.has(letter) || vowelOnNextVav)) return;
      expected += 1;
      if (pointed) marked += 1;
    });
  }
  return expected === 0 ? 1 : marked / expected;
}

/**
 * Whether a vocalizer's answer can stand in for the narration: non-empty, within the limit, still
 * Hebrew, and vocalized throughout - nearly every letter that needs a vowel mark has one. Numbers
 * become words, so the letters may differ from the plain line; {@link sameNarrationSkeleton} is what
 * ties an answer to its line.
 */
export function isUsablePronunciation(pronunciation: string): boolean {
  const text = pronunciation.trim();
  return (
    text.length > 0 &&
    text.length <= AD_STUDIO_PRONUNCIATION_MAX &&
    HEBREW_LETTER.test(stripHebrewPoints(text)) &&
    pronunciationCoverage(text) >= AD_STUDIO_PRONUNCIATION_MIN_COVERAGE
  );
}

const FINAL_LETTERS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const NUMBER_OR_SYMBOL = /[0-9%₪$€£&+@#=]/;
/** A token a narrator says as other words: a number, a symbol, an acronym (x"y) or an abbreviation ending in a geresh. */
const SPOKEN_AS_WORDS = /[0-9%₪$€£&+@#=]|[א-ת]["״][א-ת]|['׳’]$/;
/** What a number or symbol may become: a few written-out words (spaces are dropped before matching). */
const SPOKEN_WORDS_PATTERN = '[א-תa-z0-9]{1,80}';

/** Letters only (Hebrew with final forms folded, Latin lower-cased, digits), without points, spaces or punctuation. */
function skeletonLetters(text: string): string {
  return stripHebrewPoints(text)
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (letter) => FINAL_LETTERS[letter])
    .replace(/[^א-תa-z0-9]/g, '');
}

/**
 * Whether a pronunciation is the same words as the plain narration: after removing the nikud and
 * cantillation, folding final letters and dropping spacing and punctuation, the letters must match
 * exactly - except that a number, symbol, acronym or abbreviation may be written out as words. A
 * vocalizer that adds, drops, swaps or respells a word fails, so its answer is never spoken.
 */
export function sameNarrationSkeleton(plain: string, pronunciation: string): boolean {
  // A maqaf or hyphen joins a prefix to a number: split there so the prefix stays literal.
  const tokens = stripHebrewPoints(plain).replace(/־/g, ' ').split(/[\s\-/]+/).filter(Boolean);
  const pattern = tokens
    .map((token) => {
      if (!SPOKEN_AS_WORDS.test(token)) return skeletonLetters(token);
      // A Hebrew prefix glued to a number is kept; the rest may become words.
      const prefix = /^[א-ת]*/.exec(token)?.[0] ?? '';
      return NUMBER_OR_SYMBOL.test(token.slice(prefix.length)) ? `${skeletonLetters(prefix)}${SPOKEN_WORDS_PATTERN}` : SPOKEN_WORDS_PATTERN;
    })
    .join('');
  if (!pattern) return false;
  return new RegExp(`^${pattern}$`).test(skeletonLetters(pronunciation));
}

/** A usable pronunciation of these exact words - the guard every model answer passes before it is spoken. */
export function isFaithfulPronunciation(plain: string, pronunciation: string | null | undefined): pronunciation is string {
  const text = (pronunciation ?? '').trim();
  return isUsablePronunciation(text) && sameNarrationSkeleton(plain, text);
}

/**
 * Which pronunciation a line keeps after vocalizing and checking: the checked one when it is still a
 * faithful vocalization of the line, else the first one when that is, else none (the plain narration
 * is spoken). A check that rewrote words is never trusted over the first pass.
 */
export function chooseVerifiedPronunciation(plain: string, first: string | null | undefined, checked: string | null | undefined): string | undefined {
  if (isFaithfulPronunciation(plain, checked)) return checked.trim();
  if (isFaithfulPronunciation(plain, first)) return first.trim();
  return undefined;
}

/** What the nikud check knows about the ad, so a word spelled two ways is read in the sense the ad means. */
export interface AdStudioVocalizeCheckContext {
  businessName?: string | null;
  productDescription: string;
  objective?: string | null;
  audience?: string | null;
}

const CHECK_CONTEXT_MAX = 400;

/**
 * The instructions for the independent nikud check (a second model call): review each vocalized line
 * word by word against its plain text and return it corrected, with a verdict. The brief's context
 * is given so homographs resolve to the meaning the ad intends.
 */
export function buildVocalizeCheckPrompt(
  lines: readonly { id: string; text: string; pronunciation: string }[],
  context: AdStudioVocalizeCheckContext,
): AdStudioPrompt {
  const short = (value: string | null | undefined) => {
    const line = oneLine(value ?? '');
    return line.length > CHECK_CONTEXT_MAX ? `${line.slice(0, CHECK_CONTEXT_MAX - 1)}…` : line;
  };
  const contextLines = [
    context.businessName?.trim() ? `Business: ${short(context.businessName)}` : null,
    `Product: ${short(context.productDescription)}`,
    context.objective?.trim() ? `Ad goal: ${short(context.objective)}` : null,
    context.audience?.trim() ? `Audience: ${short(context.audience)}` : null,
  ].filter((line): line is string => line !== null);
  return {
    system: [
      'You are a meticulous Hebrew language editor checking the nikud (vowel points) of narration that an AI voice will read aloud in a video ad.',
      'Another model vocalized each line. Review every line word by word against its plain text, as a careful proofreader would, and fix every mistake.',
      'Check especially:',
      '- Wrong vowels: construct-state (smichut) forms, the definite article and the dagesh that follows it, the prefixes vav, he, bet, kaf, lamed, mem and shin with their correct vowel (including before sheva and gutturals), and imperative versus infinitive verb forms.',
      '- Meaning and stress: a word that can be read two ways must be vocalized in the sense the sentence and this ad mean (use the ad context below).',
      '- Numbers written out as words: correct gender and construct form agreeing with the noun they count, fully vocalized.',
      '- Foreign names written in Hebrew letters: vowels that match how the name is actually said. Names written in Latin letters stay exactly as they are.',
      '- Every Hebrew word carries full nikud; no letter that needs a vowel is left bare.',
      'Rules:',
      '- Keep the exact words, their spelling letter for letter (never add or remove a vav or yod) and their order. Never translate, rephrase, correct the wording or add words - only the vowel marks may change, and numbers or symbols may be written out as words.',
      '- Keep the punctuation that marks pauses and questions.',
      '- Return every line with its id unchanged: verdict "ok" when the vocalization was already right (return it unchanged), "fixed" when you corrected it (return the corrected line). An empty vocalization must be vocalized from scratch.',
    ].join('\n'),
    user: [
      'The ad:',
      ...contextLines,
      '',
      'Lines to check (JSON; text is the plain narration, pronunciation is the vocalization to check):',
      JSON.stringify(lines.map((line) => ({ id: line.id, text: oneLine(line.text), pronunciation: oneLine(line.pronunciation) }))),
    ].join('\n'),
  };
}

/** The instructions for vocalizing narration lines: same words, full nikud, numbers as words. */
export function buildVocalizePrompt(lines: readonly { id: string; text: string }[]): AdStudioPrompt {
  return {
    system: [
      'You prepare Hebrew narration for an AI model that will speak it aloud in a video ad.',
      'For every line, return the same words with full nikud (vowel points) on every Hebrew word, so the pronunciation is unambiguous to a speaker who cannot guess from context.',
      'Rules:',
      '- Keep the exact words and their order. Do not translate, shorten, rephrase, correct or add words.',
      '- Keep the spelling letter for letter: only add vowel marks, never add or remove a vav or yod.',
      '- Write every number, digit, percentage, price, date, time and symbol out as vocalized Hebrew words, in the grammatical gender and construct form that agree with the noun it counts (a number before a masculine noun takes the masculine form).',
      '- Write abbreviations and acronyms the way a narrator says them, as vocalized words.',
      '- Keep brand and product names written in Latin letters exactly as they are.',
      '- Keep the punctuation that marks pauses and questions.',
      '- Return one entry per line with its id unchanged.',
    ].join('\n'),
    user: ['Lines to vocalize (JSON):', JSON.stringify(lines.map((line) => ({ id: line.id, text: oneLine(line.text) })))].join('\n'),
  };
}
