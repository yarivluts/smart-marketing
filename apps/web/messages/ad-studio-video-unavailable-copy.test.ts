import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  videoFailure: Record<string, string>;
  assemblyErrors: Record<string, string>;
};

describe('Ad Studio video assembly outage is explained without naming server tools', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;

    it(`does not mention ffmpeg or the server (${name})`, () => {
      const jargon = name === 'en' ? /ffmpeg|server|installed/i : /ffmpeg|שרת|מותקן/i;
      for (const text of [a.videoFailure.ffmpeg_unavailable, a.assemblyErrors.ffmpeg_unavailable]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(jargon);
      }
    });

    it(`points to GrowthOS support, since retrying cannot help (${name})`, () => {
      expect(a.assemblyErrors.ffmpeg_unavailable).toMatch(/GrowthOS/);
      expect(a.assemblyErrors.ffmpeg_unavailable).not.toMatch(name === 'en' ? /try again\./i : /^נסו שוב/);
    });
  }
});
