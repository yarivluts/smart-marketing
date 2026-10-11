import { describe, expect, it } from 'vitest';
import {
  AD_STUDIO_IMAGE_HEADLINE_MAX,
  AD_STUDIO_MAX_IMAGE_CONCEPTS,
  buildImageConceptsPrompt,
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

describe('image prompts', () => {
  it('asks for the exact headline in the ad language and nothing else in the picture', () => {
    const prompt = buildImagePrompt(concept(), 'portrait', BRIEF);
    expect(prompt).toContain('4:5 aspect ratio');
    expect(prompt).toContain('E-signatures for lawyers');
    expect(prompt).toContain('in Hebrew: "Sign in 30 seconds"');
    expect(buildImagePrompt(concept({ headline: '' }), 'square', BRIEF)).toContain('No words, letters, captions or logos');
  });

  it('builds the concept request from the brief, the plan context and the video scenes', () => {
    const prompt = buildImageConceptsPrompt(BRIEF, {
      audience: 'Solo lawyers',
      messagingAngles: ['No printing'],
      scenes: [{ visualPrompt: 'A lawyer at a desk', onScreenText: 'Sign faster' }],
    });
    expect(prompt.system).toContain('Do not invent facts');
    expect(prompt.user).toContain('Ad language: Hebrew');
    expect(prompt.user).toContain('Audience: Solo lawyers');
    expect(prompt.user).toContain('A lawyer at a desk [text: Sign faster]');
  });
});
