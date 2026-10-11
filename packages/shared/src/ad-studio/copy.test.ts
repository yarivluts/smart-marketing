import { describe, expect, it } from 'vitest';
import { AD_STUDIO_COPY_LIMITS, adCopyIssues, buildAdCopyPrompt, fitAdCopy, isAdCopyEmpty } from './copy';
import { fitAdStudioImageConcepts, validateAdStudioImageConcepts, buildImageConceptsPrompt } from './images';
import { buildScriptPrompt } from './prompts';

const BRIEF = {
  name: 'Sign fast',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: 'https://example.com',
  format: 'vertical' as const,
  language: 'he',
  targetSeconds: 15,
};

describe('ad copy rules', () => {
  it('fits a model answer to the limits, cutting at a word where it can, and drops an empty copy', () => {
    const long = 'Sign every contract in thirty seconds from your phone today';
    const fitted = fitAdCopy({ headline: long, primaryText: '  Upload,   send,   signed.  ', description: 42 });
    expect(fitted).toEqual({ headline: 'Sign every contract in thirty', primaryText: 'Upload, send, signed.', description: '' });
    expect(fitted!.headline.length).toBeLessThanOrEqual(AD_STUDIO_COPY_LIMITS.headline);
    expect(fitAdCopy({ headline: ' ', primaryText: '', description: '' })).toBeNull();
    expect(fitAdCopy(null)).toBeNull();
    expect(fitAdCopy({ headline: 'x'.repeat(50) })!.headline).toBe('x'.repeat(30));
  });

  it('names each field past its limit, and treats a missing or blank copy as empty', () => {
    expect(adCopyIssues({ headline: 'x'.repeat(31), primaryText: 'ok', description: 'y'.repeat(91) })).toEqual(['copy_headline_too_long', 'copy_description_too_long']);
    expect(adCopyIssues({ headline: 'ok', primaryText: 'z'.repeat(91), description: '' })).toEqual(['copy_primary_text_too_long']);
    expect(adCopyIssues(null)).toEqual([]);
    expect(isAdCopyEmpty(undefined)).toBe(true);
    expect(isAdCopyEmpty({ headline: ' ', primaryText: '', description: '' })).toBe(true);
    expect(isAdCopyEmpty({ headline: 'Sign', primaryText: '', description: '' })).toBe(false);
  });

  it('asks for copy for each creative by key, in the ad language, carrying the message on its own', () => {
    const prompt = buildAdCopyPrompt(BRIEF, [
      { key: 'video', kind: 'video', about: 'Scene 1: a lawyer\n signs' },
      { key: 'c1', kind: 'image', about: 'A phone with a green check' },
    ]);
    expect(prompt.system).toContain('carry the message on its own');
    expect(prompt.system).toContain('headline (at most 30 characters');
    expect(prompt.user).toContain('Ad language: Hebrew');
    expect(JSON.parse(prompt.user.split('\n').at(-1) as string)).toEqual([
      { key: 'video', kind: 'video', about: 'Scene 1: a lawyer signs' },
      { key: 'c1', kind: 'image', about: 'A phone with a green check' },
    ]);
  });

  it('image ideas and scripts ask for copy, ideas keep and check it', () => {
    expect(buildImageConceptsPrompt(BRIEF).system).toContain('copy is the ad text that runs next to this idea');
    expect(buildScriptPrompt(BRIEF).system).toContain('copy is the ad text that runs next to the finished video');
    const [idea] = fitAdStudioImageConcepts([{ visualPrompt: 'A phone', headline: '', formats: ['square'], copy: { headline: 'Sign now', primaryText: '', description: '' } }], () => 'c1');
    expect(idea.copy).toEqual({ headline: 'Sign now', primaryText: '', description: '' });
    const [bare] = fitAdStudioImageConcepts([{ visualPrompt: 'A phone', headline: '', formats: ['square'] }], () => 'c2');
    expect('copy' in bare).toBe(false);
    expect(validateAdStudioImageConcepts([{ ...idea, copy: { headline: 'x'.repeat(31), primaryText: '', description: '' } }])).toEqual([{ code: 'copy_headline_too_long', concept: 1 }]);
  });
});
