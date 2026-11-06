import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio audience panel and publish step name Facebook and Instagram, not "Meta"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const studio = lang.AdStudio as unknown as Record<string, any>;
    it(`audience panel texts avoid the company name (${name})`, () => {
      const a = studio.audience;
      const text = [a.loading, a.kindsHint, a.savedNote, a.estimateNone].join('\n');
      expect(text).not.toMatch(name === 'en' ? /\bMeta\b/ : /מטא|Meta/);
    });
    it(`publish step hint names the platforms people know (${name})`, () => {
      const hint = studio.stepper.publish.hint;
      expect(hint).toMatch(name === 'en' ? /Facebook/ : /פייסבוק/);
    });
  }
});
