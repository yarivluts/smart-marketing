import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Share = { AdShare: { public: { intro: string } } };

describe('shared ad preview page: plain intro', () => {
  it('en: says what to do without the word "placement"', () => {
    const intro = (en as unknown as Share).AdShare.public.intro;
    expect(intro).not.toMatch(/placement/i);
    expect(intro).toContain('above each ad');
  });

  it('he: has an intro that points at the choices above each ad', () => {
    const intro = (he as unknown as Share).AdShare.public.intro;
    expect(intro).toContain('מעל כל מודעה');
    expect(intro).not.toMatch(/[A-Za-z]/);
  });
});
