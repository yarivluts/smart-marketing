import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  mediaGallery: { errors: Record<string, string> };
  siteScroll: { errors: Record<string, string> };
};

describe('gallery and page-scroll video outages say it is not the person\'s fault and who to contact', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    it(`names support and avoids "unavailable" (${name})`, () => {
      for (const text of [a.mediaGallery.errors.ffmpeg_unavailable, a.siteScroll.errors.ffmpeg_unavailable]) {
        expect(text).toMatch(/GrowthOS/);
        expect(text).not.toMatch(name === 'en' ? /unavailable|conversion/i : /אינו זמין/);
      }
    });
  }
});
