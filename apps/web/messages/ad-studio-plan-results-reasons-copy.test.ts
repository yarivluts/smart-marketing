import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio plan: why site results were skipped is said in plain words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const results = (lang.AdStudio as unknown as { plan: { reasons: { results: Record<string, string> } } }).plan.reasons.results;
    const jargon = name === 'en' ? /environment|quer(y|ies)|quota/i : /\u05e1\u05d1\u05d9\u05d1\u05d4|\u05e9\u05d0\u05d9\u05dc\u05ea\u05d5\u05ea|\u05de\u05db\u05e1\u05ea/;

    it(`results reasons avoid technical words (${name})`, () => {
      for (const text of Object.values(results)) expect(text).not.toMatch(jargon);
    });

    it(`quota reason says when it resets (${name})`, () => {
      expect(results.query_quota_exceeded).toContain(name === 'en' ? 'resets tomorrow' : '\u05de\u05d7\u05e8');
    });
  }
});
