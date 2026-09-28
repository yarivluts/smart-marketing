import { languageName, type AdStudioBriefInput, type AdStudioPrompt, type AdStudioScriptContext } from './prompts';
import type { AdStudioScene } from './scenes';

/**
 * Ad Studio image ads: the static creatives that run next to the video. A brief holds a few image
 * concepts (an idea: what the picture shows plus an optional headline drawn into it); each concept is
 * rendered in the placements it needs. Pure: the UI, the web routes, the engine and the MCP tools all
 * apply these same rules.
 */

/**
 * The placements an image is rendered for, with the aspect ratio the image model is asked for.
 * Square and portrait are the Facebook/Instagram feed; story is Stories/Reels; landscape is the
 * Google responsive display landscape slot (which Google crops to 1.91:1).
 */
export const AD_STUDIO_IMAGE_FORMATS = ['square', 'portrait', 'story', 'landscape'] as const;
export type AdStudioImageFormat = (typeof AD_STUDIO_IMAGE_FORMATS)[number];

export const AD_STUDIO_IMAGE_ASPECT_RATIO: Record<AdStudioImageFormat, '1:1' | '4:5' | '9:16' | '16:9'> = {
  square: '1:1',
  portrait: '4:5',
  story: '9:16',
  landscape: '16:9',
};

export function isAdStudioImageFormat(value: unknown): value is AdStudioImageFormat {
  return typeof value === 'string' && (AD_STUDIO_IMAGE_FORMATS as readonly string[]).includes(value);
}

/** A brief has at most this many concepts; each is rendered once per chosen format. */
export const AD_STUDIO_MAX_IMAGE_CONCEPTS = 6;
/** Short enough to read at a glance in a feed; the image model draws it into the picture. */
export const AD_STUDIO_IMAGE_HEADLINE_MAX = 40;
export const AD_STUDIO_IMAGE_VISUAL_MAX = 700;
/** An edit instruction ("make the background warmer"), like a scene edit. */
export const AD_STUDIO_IMAGE_INSTRUCTION_MAX = 500;

export interface AdStudioImageConcept {
  /** Stable across edits, so rendered images stay attached to their concept. */
  id: string;
  /** What the picture shows - subject, setting, composition, light, style - in English. */
  visualPrompt: string;
  /** Text drawn into the image, in the ad language; empty for none. */
  headline: string;
  /** The placements to render this concept in. */
  formats: AdStudioImageFormat[];
}

export type AdStudioImageConceptIssueCode =
  | 'too_many_concepts'
  | 'empty_visual_prompt'
  | 'visual_prompt_too_long'
  | 'headline_too_long'
  | 'no_formats'
  | 'unknown_format'
  | 'duplicate_concept_id';

export interface AdStudioImageConceptIssue {
  code: AdStudioImageConceptIssueCode;
  /** 1-based position of the concept, absent for whole-list issues. */
  concept?: number;
}

/** Every rule a concept list breaks; empty when it can be saved. An empty list is valid (no image ads). */
export function validateAdStudioImageConcepts(concepts: readonly AdStudioImageConcept[]): AdStudioImageConceptIssue[] {
  const issues: AdStudioImageConceptIssue[] = [];
  if (concepts.length > AD_STUDIO_MAX_IMAGE_CONCEPTS) issues.push({ code: 'too_many_concepts' });
  const seen = new Set<string>();
  concepts.forEach((concept, index) => {
    const at = index + 1;
    if (seen.has(concept.id)) issues.push({ code: 'duplicate_concept_id', concept: at });
    seen.add(concept.id);
    const visual = concept.visualPrompt.trim();
    if (!visual) issues.push({ code: 'empty_visual_prompt', concept: at });
    if (visual.length > AD_STUDIO_IMAGE_VISUAL_MAX) issues.push({ code: 'visual_prompt_too_long', concept: at });
    if (concept.headline.trim().length > AD_STUDIO_IMAGE_HEADLINE_MAX) issues.push({ code: 'headline_too_long', concept: at });
    if (concept.formats.length === 0) issues.push({ code: 'no_formats', concept: at });
    if (concept.formats.some((format) => !isAdStudioImageFormat(format))) issues.push({ code: 'unknown_format', concept: at });
  });
  return issues;
}

/** Fits a model's concepts to the rules: trims text, drops bad formats and extra concepts, defaults formats. */
export function fitAdStudioImageConcepts(
  concepts: readonly { visualPrompt: string; headline: string; formats: readonly string[] }[],
  newId: () => string,
  defaultFormats: readonly AdStudioImageFormat[] = ['square', 'portrait'],
): AdStudioImageConcept[] {
  return concepts
    .map((concept) => {
      const formats = [...new Set(concept.formats.filter(isAdStudioImageFormat))];
      return {
        id: newId(),
        visualPrompt: concept.visualPrompt.trim().slice(0, AD_STUDIO_IMAGE_VISUAL_MAX),
        headline: concept.headline.trim().slice(0, AD_STUDIO_IMAGE_HEADLINE_MAX),
        formats: formats.length ? formats : [...defaultFormats],
      };
    })
    .filter((concept) => concept.visualPrompt.length > 0)
    .slice(0, AD_STUDIO_MAX_IMAGE_CONCEPTS);
}

/** Which rendered image belongs to which concept version: a changed concept or format means a new render. */
export function imageConceptFingerprint(concept: Pick<AdStudioImageConcept, 'visualPrompt' | 'headline'>, format: AdStudioImageFormat, language: string): string {
  return JSON.stringify([concept.visualPrompt.trim(), concept.headline.trim(), format, language]);
}

const CONCEPT_RULES = [
  `Propose between 2 and ${Math.min(4, AD_STUDIO_MAX_IMAGE_CONCEPTS)} distinct image ideas; each tests a different angle (benefit, problem, social setting, product close-up) rather than repeating one.`,
  'visualPrompt describes only the picture - subject, setting, composition, lighting, colour, photographic or illustration style - in English, concretely enough for an image model. Do not ask for any text in the picture there.',
  `headline is the only text drawn into the image: at most ${AD_STUDIO_IMAGE_HEADLINE_MAX} characters, in the ad language, or empty. Prefer short, concrete benefit statements.`,
  'formats lists the placements the idea suits: square and portrait for feeds, story for full-screen vertical, landscape for Google display.',
  'Do not invent facts about the product, prices, discounts, awards, statistics or testimonials. Use only what the brief and context state.',
];

/** The instructions for proposing image concepts from a brief (and, when present, its plan and video script). */
export function buildImageConceptsPrompt(
  brief: AdStudioBriefInput,
  context: AdStudioScriptContext & { scenes?: readonly Pick<AdStudioScene, 'visualPrompt' | 'onScreenText'>[] } = {},
): AdStudioPrompt {
  const contextLines = [
    context.landingPageSummary ? `Landing page summary: ${context.landingPageSummary}` : null,
    context.audience ? `Audience: ${context.audience}` : null,
    context.messagingAngles?.length ? `Messaging angles to build on: ${context.messagingAngles.join('; ')}` : null,
    context.keywordThemes?.length ? `What people search for: ${context.keywordThemes.join('; ')}` : null,
    context.scenes?.length
      ? `The video ad's scenes, for a consistent look: ${context.scenes.map((scene) => scene.visualPrompt + (scene.onScreenText ? ` [text: ${scene.onScreenText}]` : '')).join(' | ')}`
      : null,
  ].filter((line): line is string => line !== null);
  return {
    system: ['You design static image ads for Facebook, Instagram and Google display, generated by an AI image model.', 'Rules:', ...CONCEPT_RULES.map((rule) => `- ${rule}`)].join('\n'),
    user: [
      `Ad name: ${brief.name}`,
      `Objective: ${brief.objective}`,
      `Product: ${brief.productDescription}`,
      brief.landingPageUrl ? `Landing page: ${brief.landingPageUrl}` : null,
      `Ad language: ${languageName(brief.language)}`,
      ...(contextLines.length ? ['', 'Context:', ...contextLines] : []),
      '',
      'Propose the image ideas.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}

/** The prompt the image model receives for one concept in one placement. */
export function buildImagePrompt(concept: Pick<AdStudioImageConcept, 'visualPrompt' | 'headline'>, format: AdStudioImageFormat, brief: Pick<AdStudioBriefInput, 'productDescription' | 'language'>): string {
  const headline = concept.headline.trim();
  return [
    `An advertising image, ${AD_STUDIO_IMAGE_ASPECT_RATIO[format]} aspect ratio, for: ${brief.productDescription}.`,
    concept.visualPrompt.trim(),
    headline
      ? `Draw exactly this headline into the image, large and legible, spelled exactly, in ${languageName(brief.language)}: "${headline}". No other words or letters anywhere in the image.`
      : 'No words, letters, captions or logos anywhere in the image.',
    'Clean composition with room for the subject; high quality; no watermarks or borders.',
  ].join('\n');
}
