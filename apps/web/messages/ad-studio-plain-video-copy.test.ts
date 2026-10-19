import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  references: { descriptionLabel: string };
  advanced: { description: string; avoidHint: string };
  video: { description: string };
};

describe('Ad Studio video copy avoids model and prompt jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;

    it(`names no AI vendor, "prompt" or "video model" (${name})`, () => {
      const jargon = name === 'en' ? /gemini|omni|prompt|video model/i : /gemini|omni|פרומפט|הנחיה|מודל/i;
      for (const text of [a.references.descriptionLabel, a.advanced.description, a.advanced.avoidHint, a.video.description]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(jargon);
      }
    });
  }
});
