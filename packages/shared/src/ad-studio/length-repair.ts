import { languageName, type AdStudioPrompt } from './prompts';
import { adWritingRules } from './writing-rules';

/** One generated field that came back longer than its placement allows. */
export interface AdStudioLengthRepairItem {
  /** Echoed back with the shortened text, e.g. "video:headline" or "h3". */
  id: string;
  text: string;
  /** The placement's character limit. */
  max: number;
}

/** The fields among `items` that are over their limit (after trimming spaces). */
export function overLengthItems(items: readonly AdStudioLengthRepairItem[]): AdStudioLengthRepairItem[] {
  return items.filter((item) => item.text.trim().length > item.max);
}

/**
 * The instructions for shortening over-long ad text to its limits in one cheap call, instead of
 * cutting it off mid-sentence: a cut headline goes live unfinished, a rewritten one doesn't.
 */
export function buildLengthRepairPrompt(items: readonly AdStudioLengthRepairItem[], language: string): AdStudioPrompt {
  return {
    system: [
      'You shorten ad text so each item fits its character limit.',
      'Rules:',
      '- Each result must be at most its max characters, counting every letter, space and punctuation mark. Count carefully; shorter is fine.',
      '- Keep the meaning, the main benefit and any claim, number or name exactly as written. Drop filler words, merge clauses, use shorter words.',
      '- Write a complete phrase: never end mid-word or mid-sentence, and do not add an ellipsis.',
      `- Keep the same language (${languageName(language)}) and the same tone.`,
      ...adWritingRules(language).map((rule) => `- ${rule}`),
      '- Return every item with its id unchanged.',
    ].join('\n'),
    user: ['Items (JSON):', JSON.stringify(items.map((item) => ({ id: item.id, max: item.max, text: item.text.trim() })))].join('\n'),
  };
}
