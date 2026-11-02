import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the empty Ad Studio list tells a newcomer the easiest first step', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as { adsListEmpty: string; newAdTitle: string };

    it(`points at the website box and the "New ad" card, not just "the form" (${name})`, () => {
      expect(a.adsListEmpty).toContain(a.newAdTitle);
      expect(a.adsListEmpty).toMatch(name === 'en' ? /website address/ : /כתובת האתר/);
      expect(a.adsListEmpty).not.toMatch(name === 'en' ? /with the form/ : /בעזרת הטופס/);
    });
  }
});
