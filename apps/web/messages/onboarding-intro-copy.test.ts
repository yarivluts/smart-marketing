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
