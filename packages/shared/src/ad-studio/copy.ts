import { languageName, type AdStudioBriefInput, type AdStudioPrompt, type AdStudioScriptContext } from './prompts';

/**
 * Ad copy (KAN-278): the words that run next to a creative in the feed - a headline, the primary
 * text above the media and a short description under it. A picture or a clip alone rarely carries
 * the message; every image idea and the video carry their own copy, written by the AI with the
 * ideas and the script, editable, and the publish form starts from it. Pure: the UI, routes, engine
 * and MCP tools share these rules.
 *
 * The limits fit both platforms the studio publishes to: Google responsive display allows a 30
 * character headline and 90 character descriptions; Meta shows about 125 characters of primary text
 * and 40 of the headline before truncating.
 */

export interface AdStudioAdCopy {
  /** The bold line under the media (Meta) / the short headline (Google). */
  headline: string;
  /** The text above the media (Meta) / the long headline (Google). */
  primaryText: string;
  /** The small line next to the headline (Meta) / the description (Google). */
  description: string;
}

export const AD_STUDIO_COPY_LIMITS: Readonly<Record<keyof AdStudioAdCopy, number>> = { headline: 30, primaryText: 90, description: 90 };
export const AD_STUDIO_COPY_FIELDS = ['headline', 'primaryText', 'description'] as const;

export type AdStudioAdCopyIssueCode = 'copy_headline_too_long' | 'copy_primary_text_too_long' | 'copy_description_too_long';

const ISSUE_BY_FIELD: Record<keyof AdStudioAdCopy, AdStudioAdCopyIssueCode> = {
  headline: 'copy_headline_too_long',
  primaryText: 'copy_primary_text_too_long',
  description: 'copy_description_too_long',
};

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** True when the copy says nothing at all (absent or every field blank). */
export function isAdCopyEmpty(copy: AdStudioAdCopy | null | undefined): boolean {
  return !copy || AD_STUDIO_COPY_FIELDS.every((field) => !copy[field]?.trim());
}

/** The rules a copy breaks; empty when it can be saved. Empty fields are allowed. */
export function adCopyIssues(copy: AdStudioAdCopy | null | undefined): AdStudioAdCopyIssueCode[] {
  if (!copy) return [];
  return AD_STUDIO_COPY_FIELDS.filter((field) => oneLine(copy[field] ?? '').length > AD_STUDIO_COPY_LIMITS[field]).map((field) => ISSUE_BY_FIELD[field]);
}

/** Cuts a phrase to `max` characters at a word boundary when one is near, without a trailing mark. */
function fitText(value: string, max: number): string {
  const text = oneLine(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, '');
}

/** Makes a model's copy legal instead of trusting it with character counts; null when it is empty. */
export function fitAdCopy(raw: Partial<Record<keyof AdStudioAdCopy, unknown>> | null | undefined): AdStudioAdCopy | null {
  if (!raw) return null;
  const copy = {
    headline: fitText(typeof raw.headline === 'string' ? raw.headline : '', AD_STUDIO_COPY_LIMITS.headline),
    primaryText: fitText(typeof raw.primaryText === 'string' ? raw.primaryText : '', AD_STUDIO_COPY_LIMITS.primaryText),
    description: fitText(typeof raw.description === 'string' ? raw.description : '', AD_STUDIO_COPY_LIMITS.description),
  };
  return isAdCopyEmpty(copy) ? null : copy;
}

/** The copy rules every prompt that writes copy repeats, so ideas, scripts and rewrites agree. */
export const AD_COPY_RULES = [
  `Ad copy runs next to the creative in the feed, in the ad language: headline (at most ${AD_STUDIO_COPY_LIMITS.headline} characters, the benefit in a few words), primaryText (at most ${AD_STUDIO_COPY_LIMITS.primaryText} characters, the message and a reason to act, shown above the media) and description (at most ${AD_STUDIO_COPY_LIMITS.description} characters, a short supporting line or the call to action).`,
  'The copy must carry the message on its own: someone who only glances at the image or the first second of the video must still understand what is offered and why to click. Match the objective; do not repeat the same words in all three fields.',
  'Write numbers as digits in copy (it is read, not spoken). Do not invent prices, discounts, statistics, awards or testimonials.',
];

/** One creative to write copy for. */
export interface AdStudioCopyTarget {
  /** Echoed back with its copy: "video" or an image idea id. */
  key: string;
  kind: 'video' | 'image';
  /** What the creative shows or says, so the copy fits it. */
  about: string;
}

/** The instructions for writing (or rewriting) the copy of several creatives in one call. */
export function buildAdCopyPrompt(brief: AdStudioBriefInput, targets: readonly AdStudioCopyTarget[], context: AdStudioScriptContext = {}): AdStudioPrompt {
  const contextLines = [
    context.landingPageSummary ? `Landing page summary: ${context.landingPageSummary}` : null,
    context.audience ? `Audience: ${context.audience}` : null,
    context.messagingAngles?.length ? `Messaging angles: ${context.messagingAngles.join('; ')}` : null,
  ].filter((line): line is string => line !== null);
  return {
    system: ['You write the ad copy for Facebook, Instagram and Google display ads.', 'Rules:', ...AD_COPY_RULES.map((rule) => `- ${rule}`), '- Return one entry per creative with its key unchanged.'].join('\n'),
    user: [
      `Ad name: ${brief.name}`,
      `Objective: ${brief.objective}`,
      `Product: ${brief.productDescription}`,
      brief.landingPageUrl ? `Landing page: ${brief.landingPageUrl}` : null,
      `Ad language: ${languageName(brief.language)}`,
      ...(contextLines.length ? ['', 'Context:', ...contextLines] : []),
      '',
      'Creatives (JSON):',
      JSON.stringify(targets.map((target) => ({ key: target.key, kind: target.kind, about: oneLine(target.about) }))),
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}
