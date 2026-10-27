import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = {
  visualPromptHint: string;
  video: { textNote: string };
  narration: { sceneHint: string };
  images: { description: string; visualPromptHint: string };
};

describe('Ad Studio hints talk about "the AI", not "the video/image model"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    const texts = [a.visualPromptHint, a.video.textNote, a.narration.sceneHint, a.images.description, a.images.visualPromptHint];

    it(`has no model, "text layer", "static" or "display" jargon (${name})`, () => {
      const jargon = name === 'en' ? /\bmodels?\b|text layer|\bstatic\b|display/i : /מודל|שכבת טקסט|סטטי|מדיה של גוגל/;
      for (const text of texts) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(jargon);
      }
    });

    it(`keeps the placeholders and the Hebrew-is-fine promise (${name})`, () => {
      expect(a.images.visualPromptHint).toMatch(name === 'en' ? /Any language works/ : /בעברית/);
      expect(a.visualPromptHint).toMatch(name === 'en' ? /Hebrew description/ : /בעברית/);
    });
  }
});
