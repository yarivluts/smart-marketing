import { describe, expect, it } from 'vitest';
import {
  AD_STUDIO_IMAGE_HEADLINE_MAX,
  AD_STUDIO_MAX_IMAGE_CONCEPTS,
  DEFAULT_AD_STUDIO_IMAGE_SIZE,
  buildImageConceptsPrompt,
  imageTextHasHeadline,
  isAdStudioImageSize,
  buildImagePrompt,
  fitAdStudioImageConcepts,
  imageConceptFingerprint,
  validateAdStudioImageConcepts,
  type AdStudioImageConcept,
} from './images';

const BRIEF = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: 'https://easysign.example/lawyers',
  format: 'vertical' as const,
  language: 'he',
  targetSeconds: 20,
};

const concept = (overrides: Partial<AdStudioImageConcept> = {}): AdStudioImageConcept => ({
  id: 'c1',
  visualPrompt: 'A lawyer signing on a phone in a bright office',
  headline: 'Sign in 30 seconds',
  formats: ['square'],
  ...overrides,
});

describe('image concepts', () => {
  it('accepts a valid list, including an empty one', () => {
    expect(validateAdStudioImageConcepts([])).toEqual([]);
    expect(validateAdStudioImageConcepts([concept(), concept({ id: 'c2', headline: '', formats: ['story', 'landscape'] })])).toEqual([]);
  });

  it('reports every broken rule with the concept position', () => {
    const issues = validateAdStudioImageConcepts([
      concept({ visualPrompt: '  ' }),
      concept({ headline: 'x'.repeat(AD_STUDIO_IMAGE_HEADLINE_MAX + 1), formats: [] }),
      concept({ formats: ['banner' as never] }),
    ]);
    expect(issues).toEqual([
      { code: 'empty_visual_prompt', concept: 1 },
      { code: 'duplicate_concept_id', concept: 2 },
      { code: 'headline_too_long', concept: 2 },
      { code: 'no_formats', concept: 2 },
      { code: 'duplicate_concept_id', concept: 3 },
      { code: 'unknown_format', concept: 3 },
    ]);
    const tooMany = Array.from({ length: AD_STUDIO_MAX_IMAGE_CONCEPTS + 1 }, (_, index) => concept({ id: `c${index}` }));
    expect(validateAdStudioImageConcepts(tooMany)).toEqual([{ code: 'too_many_concepts' }]);
  });

  it('fits a model answer to the rules: trims, drops unknown formats and empty ideas, defaults formats, caps the count', () => {
    let n = 0;
    const fitted = fitAdStudioImageConcepts(
      [
        { visualPrompt: '  A desk  ', headline: `  ${'y'.repeat(60)}  `, formats: ['square', 'banner', 'square'] },
        { visualPrompt: '   ', headline: 'dropped', formats: ['story'] },
        { visualPrompt: 'A phone', headline: '', formats: [] },
        ...Array.from({ length: 10 }, () => ({ visualPrompt: 'more', headline: '', formats: ['story'] })),
      ],
      () => `id${(n += 1)}`,
    );
    expect(fitted[0]).toEqual({ id: 'id1', visualPrompt: 'A desk', headline: 'y'.repeat(AD_STUDIO_IMAGE_HEADLINE_MAX), formats: ['square'] });
    expect(fitted[1]).toMatchObject({ visualPrompt: 'A phone', formats: ['square', 'portrait'] });
    expect(fitted).toHaveLength(AD_STUDIO_MAX_IMAGE_CONCEPTS);
    expect(validateAdStudioImageConcepts(fitted)).toEqual([]);
  });

  it('fingerprints change with the picture, the headline, the placement and the language only', () => {
    const base = imageConceptFingerprint(concept(), 'square', 'he');
    expect(imageConceptFingerprint(concept({ id: 'other' }), 'square', 'he')).toBe(base);
    expect(imageConceptFingerprint(concept({ headline: 'New' }), 'square', 'he')).not.toBe(base);
    expect(imageConceptFingerprint(concept(), 'story', 'he')).not.toBe(base);
    expect(imageConceptFingerprint(concept(), 'square', 'en')).not.toBe(base);
  });
});

describe('image headline check', () => {
  it('finds the headline in the text read off the image, ignoring spacing, punctuation, case and vowel marks', () => {
    expect(imageTextHasHeadline('Sign in 30 seconds!', 'EasySign\nSIGN IN 30  seconds')).toBe(true);
    expect(imageTextHasHeadline('\u05d7\u05ea\u05de\u05d5 \u05de\u05d4\u05e8', '\u05d7\u05b8\u05ea\u05b0\u05de\u05d5\u05bc \u05de\u05b7\u05d4\u05b5\u05e8.')).toBe(true);
  });

  it('reports a misspelled or missing headline, and accepts any text when there is no headline', () => {
    expect(imageTextHasHeadline('Sign in 30 seconds', 'Sing in 30 seconds')).toBe(false);
    expect(imageTextHasHeadline('\u05d7\u05ea\u05de\u05d5 \u05de\u05d4\u05e8', '\u05d7\u05ea\u05de\u05d5 \u05de\u05d7\u05e8')).toBe(false);
    expect(imageTextHasHeadline('Sign in 30 seconds', '')).toBe(false);
    expect(imageTextHasHeadline('  ', 'anything')).toBe(true);
  });

  it('knows the image sizes, 2K by default', () => {
    expect(DEFAULT_AD_STUDIO_IMAGE_SIZE).toBe('2K');
    expect(isAdStudioImageSize('1K')).toBe(true);
    expect(isAdStudioImageSize('4K')).toBe(false);
  });
});

describe('image prompts', () => {
  it('asks for the exact headline in the ad language and nothing else in the picture', () => {
    const prompt = buildImagePrompt(concept(), 'portrait', BRIEF);
    expect(prompt).toContain('4:5 aspect ratio');
    expect(prompt).toContain('E-signatures for lawyers');
    expect(prompt).toContain('in Hebrew: "Sign in 30 seconds"');
    expect(prompt).toContain('never over a face, a person or the subject');
    expect(buildImagePrompt(concept({ headline: '' }), 'square', BRIEF)).toContain('No words, letters, captions or logos');
    // A text-free picture for the studio's own headline keeps a calm area for it, below the story app bar.
    expect(buildImagePrompt(concept({ headline: '' }), 'square', BRIEF, { headlineSpace: true })).toContain('Keep the top quarter of the picture calm and plain');
    expect(buildImagePrompt(concept({ headline: '' }), 'story', BRIEF, { headlineSpace: true })).toContain('band just below the top 14%');
    expect(buildImagePrompt(concept({ headline: '' }), 'square', BRIEF)).not.toContain('a headline will be set on it');
    // Device screens carry no readable text: image models otherwise draw English UI words into a Hebrew ad.
    // Devices stay secondary and out of focus, so screens carry no text and never float toward the camera.
    expect(prompt).toContain('screen softly out of focus - no readable words');
    expect(prompt).toContain('Never show a device held toward the camera');
    expect(prompt).toContain('At most one phone or tablet appears in the whole scene');
    expect(prompt).toContain('no floating cards, labels, badges, icons');
    expect(prompt).toContain('illegible scribble on that document or screen only');
    expect(prompt).not.toContain('anywhere in the picture, is');
    expect(prompt).toContain('real-world size and proportions');
  });

  it('keeps the subject and headline clear of what each placement covers or crops', () => {
    expect(buildImagePrompt(concept(), 'story', BRIEF)).toContain('top 14% and bottom 20%');
    // The story safe zone must not read as a request to draw the phone app around the picture.
    expect(buildImagePrompt(concept(), 'story', BRIEF)).toContain('Do not draw any phone frame, status bar, app interface');
    expect(buildImagePrompt(concept(), 'story', BRIEF)).not.toContain('the app covers');
    // Nor as a request for empty bands: the scene runs to the edges.
    expect(buildImagePrompt(concept(), 'story', BRIEF)).toContain('no empty bands, borders or frames');
    expect(buildImagePrompt(concept(), 'story', BRIEF)).not.toContain('plain background');
    expect(buildImagePrompt(concept(), 'landscape', BRIEF)).toContain('cropped to 1.91:1');
    expect(buildImagePrompt(concept(), 'square', BRIEF)).not.toMatch(/14%|1\.91:1/);
  });

  it('builds the concept request from the brief, the plan context and the video scenes', () => {
    const prompt = buildImageConceptsPrompt(BRIEF, {
      audience: 'Solo lawyers',
      messagingAngles: ['No printing'],
      scenes: [{ visualPrompt: 'A lawyer at a desk', onScreenText: 'Sign faster' }],
    });
    expect(prompt.system).toContain('Never invent facts');
    // Ideas are not built around a screen, which image models draw badly.
    expect(prompt.system).toContain('never a close-up of a phone or computer screen');
    expect(prompt.system).toContain('plural imperative');
    expect(prompt.user).toContain('Ad language: Hebrew');
    expect(prompt.user).toContain('Audience: Solo lawyers');
    expect(prompt.user).toContain('A lawyer at a desk [text: Sign faster]');
  });
});
