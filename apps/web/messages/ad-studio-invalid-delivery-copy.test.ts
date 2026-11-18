import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio "unknown narration choice" problem says what to do', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Record<string, any>;

    it(`names the scene and the two choices the person sees (${name})`, () => {
      const text: string = a.issues.invalid_delivery;
      expect(text).toContain('{scene}');
      expect(text).toContain(a.speaker.voiceover);
      expect(text).toContain(a.speaker.on_screen);
    });
  }
});
