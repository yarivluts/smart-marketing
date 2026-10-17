import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio keyword-data and Meta audience messages avoid secret / vault / permission-code jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as {
      keywordDataMissing: Record<string, string>;
      audience: { unavailable: Record<string, string> };
    };
    const jargon = name === 'en' ? /credential|secret|vault|deployment|ads_read/i : /כספת|סוד|פרטי גישה|ads_read|ספריית המשאבים/;

    it(`keyword-data messages are plain (${name})`, () => {
      for (const text of Object.values(a.keywordDataMissing)) expect(text).not.toMatch(jargon);
    });

    it(`Meta audience messages are plain (${name})`, () => {
      for (const text of Object.values(a.audience.unavailable)) expect(text).not.toMatch(jargon);
    });
  }
});
