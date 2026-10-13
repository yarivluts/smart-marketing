import { describe, expect, it } from 'vitest';
import { betterImageVerdict, buildImageQaPrompt, imageQaVerdict } from './image-qa';
import { withFixes } from './image-pipeline';

describe('buildImageQaPrompt', () => {
  it('asks for the exact headline, every word read as drawn, and details in the ad language', () => {
    const prompt = buildImageQaPrompt({ headline: 'Sign in 30 seconds', visualPrompt: 'A lawyer at a desk', language: 'he' });
    expect(prompt.system).toContain('Write every issue detail in Hebrew');
    expect(prompt.user).toContain('spelled exactly: "Sign in 30 seconds"');
    expect(prompt.user).toContain('misspellings included');
    expect(prompt.user).toContain('Intended picture: A lawyer at a desk');
    // A readable word in another language - an English UI label, a legible signature - fails a Hebrew ad.
    expect(prompt.user).toContain('any readable word in a language other than Hebrew');
    // Wrong proportions and impossible objects are major, so they trigger a re-render.
    expect(prompt.user).toContain('an object at a clearly wrong size or proportion');
    expect(prompt.user).toContain('something physically impossible');
    expect(prompt.user).toContain('extra hands or limbs that belong to no one');
    expect(prompt.user).toContain('the picture drawn as a phone screen or app');
    expect(prompt.user).toContain('empty bands, borders or letterboxing');
  });

  it('treats any text as a problem when there is no headline, and checks spelling only after an edit', () => {
    expect(buildImageQaPrompt({ headline: '', visualPrompt: 'v', language: 'en' }).user).toContain('No text, letters or logos should appear');
    const edited = buildImageQaPrompt({ headline: null, visualPrompt: 'v', language: 'en' }).user;
    expect(edited).toContain('Any text in the image must be correct English');
    expect(edited).not.toContain('spelled exactly');
  });
});

describe('imageQaVerdict', () => {
  it('passes when the headline is in the picture and only minor problems were found', () => {
    expect(imageQaVerdict({ headline: 'Sign in 30 seconds' }, { textInImage: 'SIGN IN 30 SECONDS', issues: [{ severity: 'minor', detail: ' Slight blur ', fix: 'Sharper focus' }] }, 'gemini')).toEqual({
      status: 'passed',
      issues: [{ severity: 'minor', detail: 'Slight blur' }],
      text: 'SIGN IN 30 SECONDS',
      model: 'gemini',
      // A minor problem does not steer a re-render.
      fixes: [],
    });
  });

  it('fails a misspelled headline even when the reviewer did not notice it', () => {
    const verdict = imageQaVerdict({ headline: 'Sign in 30 seconds' }, { textInImage: 'Sing in 30 seconds', issues: [] }, 'gemini');
    expect(verdict.status).toBe('issues');
    expect(verdict.issues).toEqual([{ severity: 'major', code: 'headline_mismatch', detail: 'Sing in 30 seconds' }]);
    // The next render is told to spell it exactly.
    expect(verdict.fixes).toEqual(['Spell the headline exactly as given, letter by letter: "Sign in 30 seconds".']);
  });

  it('turns each major problem into an English fix for the next render', () => {
    const verdict = imageQaVerdict(
      { headline: '' },
      {
        textInImage: '',
        issues: [
          { severity: 'major', detail: 'phone too big', fix: '  The phone fits in one hand. ' },
          { severity: 'major', detail: 'legs merge into a box', fix: 'Show the whole person seated, legs under the table.' },
          { severity: 'minor', detail: 'slight blur', fix: 'Sharper.' },
        ],
      },
      'gemini',
    );
    expect(verdict.fixes).toEqual(['The phone fits in one hand.', 'Show the whole person seated, legs under the table.']);
  });

  it('keeps the reviewer own major finding instead of adding a second one, and does not compare after an edit', () => {
    const verdict = imageQaVerdict({ headline: 'Sign' }, { textInImage: 'Sgin', issues: [{ severity: 'major', detail: 'Misspelled headline', fix: 'Spell it right.' }] }, 'gemini');
    expect(verdict.issues).toEqual([{ severity: 'major', detail: 'Misspelled headline' }]);
    expect(imageQaVerdict({ headline: null }, { textInImage: 'Anything new', issues: [] }, 'gemini').status).toBe('passed');
  });
});

describe('betterImageVerdict', () => {
  const verdict = (majors: number, minors: number) => ({
    status: majors ? ('issues' as const) : ('passed' as const),
    issues: [...Array.from({ length: majors }, () => ({ severity: 'major' as const, detail: 'm' })), ...Array.from({ length: minors }, () => ({ severity: 'minor' as const, detail: 'n' }))],
    text: null,
    model: null,
  });

  it('prefers fewer major problems, then fewer problems', () => {
    expect(betterImageVerdict(verdict(0, 3), verdict(1, 0))).toBe(true);
    expect(betterImageVerdict(verdict(1, 0), verdict(1, 2))).toBe(true);
    expect(betterImageVerdict(verdict(1, 2), verdict(1, 2))).toBe(false);
  });
});

describe('withFixes', () => {
  it('leaves the first render alone and tells a retry what to do differently', () => {
    expect(withFixes('A lawyer at a desk', [])).toBe('A lawyer at a desk');
    expect(withFixes('A lawyer at a desk', ['The phone fits in one hand.', 'Legs under the table.'])).toBe(
      ['A lawyer at a desk', 'An earlier render of this picture had problems. This time: The phone fits in one hand. Legs under the table.'].join('\n'),
    );
  });
});
