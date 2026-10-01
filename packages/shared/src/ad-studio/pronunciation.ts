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

/**
 * Whether a vocalizer's answer can stand in for the narration: non-empty, within the limit, still
 * Hebrew. Numbers become words, so the letters may differ from the plain line - this only rejects
 * an answer that is plainly not a vocalization of a Hebrew line.
 */
export function isUsablePronunciation(pronunciation: string): boolean {
  const text = pronunciation.trim();
  return text.length > 0 && text.length <= AD_STUDIO_PRONUNCIATION_MAX && HEBREW_LETTER.test(stripHebrewPoints(text));
}

/** The instructions for vocalizing narration lines: same words, full nikud, numbers as words. */
export function buildVocalizePrompt(lines: readonly { id: string; text: string }[]): AdStudioPrompt {
  return {
    system: [
      'You prepare Hebrew narration for an AI model that will speak it aloud in a video ad.',
      'For every line, return the same words with full nikud (vowel points) on every Hebrew word, so the pronunciation is unambiguous to a speaker who cannot guess from context.',
      'Rules:',
      '- Keep the exact words and their order. Do not translate, shorten, rephrase, correct or add words.',
      '- Write every number, digit, percentage, price, date, time and symbol out as vocalized Hebrew words, in the grammatical gender and construct form that agree with the noun it counts (a number before a masculine noun takes the masculine form).',
      '- Write abbreviations and acronyms the way a narrator says them, as vocalized words.',
      '- Keep brand and product names written in Latin letters exactly as they are.',
      '- Keep the punctuation that marks pauses and questions.',
      '- Return one entry per line with its id unchanged.',
    ].join('\n'),
    user: ['Lines to vocalize (JSON):', JSON.stringify(lines.map((line) => ({ id: line.id, text: oneLine(line.text) })))].join('\n'),
  };
}
