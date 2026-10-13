import { z } from 'zod/v4';
import { imageTextHasHeadline, languageName } from '@growthos/shared';
import { assertAdStudioQuota, AdStudioQuotaExceededError, recordAdStudioUsage, type AdStudioImageQaIssue, type AdStudioImageQaStatus } from '@growthos/firebase-orm-models';
import { AdStudioProviderError, type AdStudioReviewer } from './llm';

/**
 * The AI check of a rendered ad image. Image models misspell words - Hebrew most of all - and draw
 * extra letters, melted hands and invented logos, any of which embarrasses a brand in a feed. Before
 * an image is shown as the chosen version, Gemini looks at it: it writes down every word in the
 * picture and lists what is wrong. The headline is then also compared with that text in code
 * (`imageTextHasHeadline`), so a misspelling fails the check even when the reviewer missed it. A
 * failing render is redrawn automatically, up to the project's retry count.
 */

const MAX_ISSUES = 8;
/** Languages written right to left, where digits inside the text still read left to right. */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['he', 'ar', 'fa', 'ur']);

export const AdStudioImageQaSchema = z.object({
  textInImage: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(['major', 'minor']),
      /** What the problem is about: the headline itself, other text in the picture, or the picture. */
      about: z.enum(['headline_text', 'headline_placement', 'other_text', 'picture']),
      detail: z.string(),
      /** In English, for the image model: how to draw it instead. The next render gets it as an instruction. */
      fix: z.string(),
    }),
  ),
});

export interface ImageQaSubject {
  /** The exact text the image should carry ('' for none); null after an edit, whose text the person may have changed. */
  headline: string | null;
  visualPrompt: string;
  language: string;
}

export function buildImageQaPrompt(subject: ImageQaSubject): { system: string; user: string } {
  const language = languageName(subject.language);
  const headline = subject.headline === null ? null : subject.headline.trim();
  const expectedText =
    headline === null
      ? `Any text in the image must be correct ${language}: spelled right and written in the right direction.`
      : headline
        ? `The only text that should appear in the image, spelled exactly: "${headline}".`
        : 'No text, letters or logos should appear in the image.';
  const majorText =
    headline === null
      ? 'Major problems: a misspelled, cut-off or garbled word; text in the wrong writing direction; gibberish letters.'
      : headline
        ? 'Major problems: the headline misspelled, cut off, with a missing, extra or swapped letter or word, or in the wrong writing direction; any other text in the image; gibberish letters.'
        : 'Major problems: any text, letters or logo in the image; gibberish letters.';
  return {
    system: [
      'You check AI-generated ad images before a person sees them. Be strict about anything that would embarrass the brand in a feed, and never invent a problem you do not see.',
      `Write every issue detail in ${language}, for the people making this ad.`,
    ].join('\n'),
    user: [
      `Language of the ad: ${language}.`,
      // A reviewer once called a perfect Hebrew headline with "30" in it reversed: digits inside RTL text read left to right.
      RTL_LANGUAGES.has(subject.language.toLowerCase())
        ? `${language} is written right to left, but a number inside it keeps its digits left to right (for example "30"); that is correct, not reversed. Judge the word order only from right to left.`
        : null,
      expectedText,
      `Intended picture: ${subject.visualPrompt}`,
      '',
      '1) textInImage: copy every word, letter and number visible in the image exactly as drawn, misspellings included (empty when there is none). Do not correct anything.',
      `2) issues: every problem, each with severity, about (headline_text for its spelling, letters, word order or direction; headline_placement for where it sits; other_text; picture), a short detail a person can act on, in ${language}, and fix: one short instruction in English telling an image model how to draw it right instead (for example "show the whole person seated, legs under the table", "the phone fits in one hand").`,
      majorText,
      `Also major: any readable word in a language other than ${language} anywhere in the picture - on a screen, a sign, a document or as a legible signature (an illegible scribble is fine); a deformed face, hand or body (extra or missing fingers, melted features); an object at a clearly wrong size or proportion (a phone as big as a tablet, a cup bigger than a head); something physically impossible (writing floating on a table, an object merged into another); extra hands or limbs that belong to no one in the picture; the picture drawn as a phone screen or app (a status bar, app bars, buttons or navigation icons around it); a floating card, label, badge, icon, checkmark or other graphic overlay that is not the headline; the headline over a face, a person or the subject; the same object twice where one belongs (a pen in each hand); empty bands, borders or letterboxing at the edges instead of the scene; a watermark or border; an invented brand logo.`,
      'Minor problems: slight blur, small background artifacts, text a little small for a phone screen.',
      'If you find nothing, return an empty issues list.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}

export interface ImageQaVerdict {
  status: AdStudioImageQaStatus;
  issues: AdStudioImageQaIssue[];
  text: string | null;
  model: string | null;
  /** English instructions for the next render, from the major problems; empty when there are none. */
  fixes?: string[];
}

/**
 * Turns the reviewer's answer into a verdict. When the text read off the image does not contain the
 * headline and the reviewer reported no major problem itself, a `headline_mismatch` issue is added
 * (the UI words it, showing what was read). Pure.
 */
export function imageQaVerdict(subject: Pick<ImageQaSubject, 'headline'> & { language?: string }, review: z.infer<typeof AdStudioImageQaSchema>, model: string): ImageQaVerdict {
  const text = review.textInImage.trim().slice(0, 500);
  const headline = subject.headline?.trim() ?? '';
  // The code's comparison outranks the reviewer on the headline's text: when the text read off the image
  // holds it exactly, a reviewer finding about its spelling or order is wrong. In right-to-left ads it is
  // always the same false alarm ("reversed", from digits inside RTL text), so it is dropped; elsewhere it
  // is kept as minor. Where the headline sits (over a face) is judged by the reviewer as usual.
  const headlineConfirmed = Boolean(headline) && imageTextHasHeadline(headline, text);
  const rtl = RTL_LANGUAGES.has((subject.language ?? '').toLowerCase());
  const kept = review.issues
    .filter((issue) => !(headlineConfirmed && rtl && issue.about === 'headline_text'))
    .map((issue) => (headlineConfirmed && issue.about === 'headline_text' ? { ...issue, severity: 'minor' as const } : issue));
  const issues: AdStudioImageQaIssue[] = kept.slice(0, MAX_ISSUES).map((issue) => ({ severity: issue.severity, detail: issue.detail.trim().slice(0, 300) }));
  if (headline && !imageTextHasHeadline(headline, text) && !issues.some((issue) => issue.severity === 'major')) {
    issues.unshift({ severity: 'major', code: 'headline_mismatch', detail: text.slice(0, 300) });
  }
  const fixes = kept
    .filter((issue) => issue.severity === 'major')
    .map((issue) => issue.fix.replace(/\s+/g, ' ').trim().slice(0, 200))
    .filter(Boolean);
  if (issues[0]?.code === 'headline_mismatch') fixes.unshift(`Spell the headline exactly as given, letter by letter: "${headline}".`);
  return { status: issues.some((issue) => issue.severity === 'major') ? 'issues' : 'passed', issues, text: text || null, model, fixes: fixes.slice(0, MAX_ISSUES) };
}

export interface ReviewAdStudioImageParams {
  organizationId: string;
  projectId: string;
  briefId: string;
  actorId: string;
  image: { bytes: Buffer; mimeType: string };
  subject: ImageQaSubject;
  reviewer: AdStudioReviewer | null;
  now?: Date;
}

/**
 * Checks one rendered image. Never throws for a provider failure or a used-up text limit: the
 * verdict is then `error` or `skipped`, so a render is never lost to its check.
 */
export async function reviewAdStudioImage(params: ReviewAdStudioImageParams): Promise<ImageQaVerdict> {
  const { reviewer } = params;
  const skipped: ImageQaVerdict = { status: 'skipped', issues: [], text: null, model: null };
  if (!reviewer) return skipped;
  try {
    await assertAdStudioQuota({ organizationId: params.organizationId, projectId: params.projectId, kind: 'image_qa', units: 1, now: params.now });
  } catch (error) {
    if (error instanceof AdStudioQuotaExceededError) return skipped;
    throw error;
  }
  const usage = (outcome: 'succeeded' | 'failed', failureReason?: string) =>
    recordAdStudioUsage({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: 'image_qa',
      provider: reviewer.provider,
      model: reviewer.model,
      units: 1,
      briefId: params.briefId,
      actorId: params.actorId,
      outcome,
      ...(failureReason ? { failureReason } : {}),
      now: params.now,
    });
  try {
    const review = await reviewer.reviewJson({
      ...buildImageQaPrompt(params.subject),
      schema: AdStudioImageQaSchema,
      media: [{ mimeType: params.image.mimeType, data: params.image.bytes }],
    });
    await usage('succeeded');
    return imageQaVerdict(params.subject, review, reviewer.model);
  } catch (error) {
    const reason = error instanceof AdStudioProviderError ? error.code : 'error';
    await usage('failed', reason).catch(() => undefined);
    console.error('[ad-studio] image quality check failed', { briefId: params.briefId, reason, error: error instanceof Error ? error.message : String(error) });
    return { status: 'error', issues: [], text: null, model: reviewer.model };
  }
}

/** Fewer major problems first, then fewer problems: which of several renders of one concept to keep. */
export function betterImageVerdict(a: ImageQaVerdict, b: ImageQaVerdict): boolean {
  const majors = (verdict: ImageQaVerdict) => verdict.issues.filter((issue) => issue.severity === 'major').length;
  return majors(a) !== majors(b) ? majors(a) < majors(b) : a.issues.length < b.issues.length;
}
