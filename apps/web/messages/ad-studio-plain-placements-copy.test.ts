import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio image options say where the ad shows, not "placements"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Record<string, any>;
    const texts = (): string[] => {
      const out: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === 'string') out.push(v);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(a.autopilot);
      walk(a.images);
      return out;
    };

    it(`keeps the jargon word out of the autopilot and image copy (${name})`, () => {
      const jargon = name === 'en' ? /placement/i : /מיקומי תמונה|מיקום תמונה|במיקומים|והמיקומים|המיקומים\)|בכל מיקום|מיקום אחד|מיקום לא מוכר|המיקום הזה/;
      for (const text of texts()) expect(text).not.toMatch(jargon);
    });

    it(`still has a message for every image-format refusal (${name})`, () => {
      for (const key of ['no_formats', 'unknown_format', 'format_not_in_concept']) {
        expect(JSON.stringify(a.images)).toContain(`"${key}"`);
      }
    });
  }
});
