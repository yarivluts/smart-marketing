import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('onboarding intro promises no technical work', () => {
  it.each([
    ['en', en.Onboarding.introBody, /connect|data/i],
    ['he', he.Onboarding.introBody, /נחבר|נתונים/],
  ])('%s intro does not ask the newcomer to connect data', (_locale, text, banned) => {
    expect(text).toBeTruthy();
    expect(text).not.toMatch(banned);
  });
});

describe('onboarding intro and start hint agree on the number of steps', () => {
  it('both locales say four steps in the intro, like the start hint', () => {
    expect(en.Onboarding.introBody).toMatch(/four/i);
    expect(en.Onboarding.startHint).toMatch(/four/i);
    expect(he.Onboarding.introBody).toContain('ארבעה שלבים');
    expect(he.Onboarding.startHint).toContain('ארבעה שלבים');
  });
});
