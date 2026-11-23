import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio "make an ad from my site" - private address reason', () => {
  it('en says what happened and what to enter instead', () => {
    const text = en.AdStudio.fromSite.reasons.blocked;
    expect(text).toMatch(/not a public website/i);
    expect(text).toMatch(/Enter your website address/i);
  });

  it('he says what to enter instead, in Hebrew', () => {
    const text = he.AdStudio.fromSite.reasons.blocked;
    expect(text).toMatch(/[֐-׿]/);
    expect(text).toContain('הכניסו את כתובת האתר שלכם');
  });
});
