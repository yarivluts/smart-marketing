import { describe, expect, it } from 'vitest';
import { betterImageVerdict, buildHeadlineReadPrompt, buildImageQaPrompt, imageQaVerdict } from './image-qa';
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
    expect(prompt.user).toContain('a floating card, label, badge, icon, checkmark or other graphic overlay');
    expect(prompt.user).toContain('the headline over a face, a person or the subject');
    expect(prompt.user).toContain('two phones or tablets at once');
    expect(prompt.user).toContain('the picture split into panels, a collage or a plain band');
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
    expect(imageQaVerdict({ headline: 'Sign in 30 seconds' }, { textInImage: 'SIGN IN 30 SECONDS', issues: [{ severity: 'minor', about: 'quality', detail: ' Slight blur ', fix: 'Sharper focus' }] }, 'gemini')).toEqual({
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
          { severity: 'major', about: 'proportion', detail: 'phone too big', fix: '  The phone fits in one hand. ' },
          { severity: 'major', about: 'proportion', detail: 'legs merge into a box', fix: 'Show the whole person seated, legs under the table.' },
          { severity: 'minor', about: 'quality', detail: 'slight blur', fix: 'Sharper.' },
        ],
      },
      'gemini',
    );
    expect(verdict.fixes).toEqual(['The phone fits in one hand.', 'Show the whole person seated, legs under the table.']);
  });

  it('keeps the reviewer own major finding instead of adding a second one, and does not compare after an edit', () => {
    const verdict = imageQaVerdict({ headline: 'Sign' }, { textInImage: 'Sgin', issues: [{ severity: 'major', about: 'headline_text', detail: 'Misspelled headline', fix: 'Spell it right.' }] }, 'gemini');
    expect(verdict.issues).toEqual([{ severity: 'major', detail: 'Misspelled headline' }]);
    expect(imageQaVerdict({ headline: null }, { textInImage: 'Anything new', issues: [] }, 'gemini').status).toBe('passed');
  });
});

describe('right-to-left headlines', () => {
  it('tells the reviewer that digits inside Hebrew read left to right', () => {
    expect(buildImageQaPrompt({ headline: 'x', visualPrompt: 'v', language: 'he' }).user).toContain('a number inside it keeps its digits left to right');
    expect(buildImageQaPrompt({ headline: 'x', visualPrompt: 'v', language: 'en' }).user).not.toContain('right to left');
  });

  it('drops the reviewer "reversed" finding on a headline the code confirmed in a right-to-left ad', () => {
    const verdict = imageQaVerdict(
      { headline: 'Sign in 30 seconds', language: 'he' },
      {
        textInImage: 'Sign in 30 seconds',
        issues: [
          { severity: 'major', about: 'headline_text', detail: 'The words are reversed', fix: 'Write it right to left.' },
          { severity: 'major', about: 'headline_placement', detail: 'The headline covers her face', fix: 'Put the headline on the plain wall.' },
        ],
      },
      'gemini',
    );
    // Where the headline sits still counts: only the false text finding goes.
    expect(verdict.status).toBe('issues');
    expect(verdict.issues).toEqual([{ severity: 'major', detail: 'The headline covers her face' }]);
    expect(verdict.fixes).toEqual(['Put the headline on the plain wall.']);
  });

  it('keeps a headline the code confirmed, showing a reviewer "reversed" finding only as minor', () => {
    const verdict = imageQaVerdict(
      { headline: 'Sign in 30 seconds' },
      { textInImage: 'Sign in 30 seconds', issues: [{ severity: 'major', about: 'headline_text', detail: 'The words are reversed', fix: 'Write it right to left.' }] },
      'gemini',
    );
    expect(verdict.status).toBe('passed');
    expect(verdict.issues).toEqual([{ severity: 'minor', detail: 'The words are reversed' }]);
    expect(verdict.fixes).toEqual([]);
  });
});

describe('a separate reading of the headline', () => {
  it('reads right-to-left text from the right, digits kept in order', () => {
    expect(buildHeadlineReadPrompt('he').user).toContain('start from the word furthest to the right');
    expect(buildHeadlineReadPrompt('en').user).toContain('left to right');
  });

  it('clears a reviewer that copied a correct headline reversed', () => {
    const review = { textInImage: 'seconds 30 in Sign', issues: [{ severity: 'major' as const, about: 'headline_text' as const, detail: 'Reversed', fix: 'Right to left.' }] };
    expect(imageQaVerdict({ headline: 'Sign in 30 seconds', language: 'he' }, review, 'gemini').status).toBe('issues');
    expect(imageQaVerdict({ headline: 'Sign in 30 seconds', language: 'he', headlineConfirmedByReading: true }, review, 'gemini')).toMatchObject({ status: 'passed', issues: [] });
  });
});

describe('a headline the studio set itself', () => {
  it('asks only about its placement, and drops any finding about its words', () => {
    expect(buildImageQaPrompt({ headline: 'Sign fast', visualPrompt: 'v', language: 'he', headlineSetByCode: true }).user).toContain('judge only where it sits');
    const verdict = imageQaVerdict(
      { headline: 'Sign in 30 seconds', language: 'he', headlineSetByCode: true },
      {
        textInImage: 'seconds 30 in Sign',
        issues: [
          { severity: 'major', about: 'headline_text', detail: 'The words are reversed', fix: 'Write it right to left.' },
          { severity: 'major', about: 'headline_placement', detail: 'Over her face', fix: 'Move it to the wall.' },
        ],
      },
      'gemini',
    );
    // No mismatch from the read-back text either: the code drew exactly these words.
    expect(verdict.issues).toEqual([{ severity: 'major', detail: 'Over her face' }]);
    expect(imageQaVerdict({ headline: 'Sign', language: 'he', headlineSetByCode: true }, { textInImage: 'nqiS', issues: [] }, 'gemini').status).toBe('passed');
  });
});

describe('severity by kind', () => {
  it('fails any real defect the reviewer under-rated, keeps blur minor, and trusts it only for other', () => {
    const verdict = imageQaVerdict(
      { headline: '' },
      {
        textInImage: '',
        issues: [
          { severity: 'minor', about: 'duplicate', detail: 'a pen in each hand', fix: 'One pen, in one hand.' },
          { severity: 'minor', about: 'overlay', detail: 'a plain band across the top', fix: 'The scene runs to the top edge.' },
          { severity: 'major', about: 'quality', detail: 'slight blur', fix: 'Sharper.' },
          { severity: 'minor', about: 'other', detail: 'cup a little too shiny', fix: 'Matte cup.' },
        ],
      },
      'gemini',
    );
    expect(verdict.status).toBe('issues');
    expect(verdict.issues.map((issue) => issue.severity)).toEqual(['major', 'major', 'minor', 'minor']);
    expect(verdict.fixes).toEqual(['One pen, in one hand.', 'The scene runs to the top edge.']);
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
