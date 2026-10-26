import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Metric lineage copy avoids developer jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const s = (lang as unknown as Record<string, Record<string, string>>).MetricRegistry;
    const text = [s.heroDescription, s.lineageFooter, s.lineageSchemaSub].join('\n');

    it(`does not say schema (${name})`, () => {
      expect(text).not.toMatch(name === 'en' ? /schema/i : /סכמ|סכימ/);
    });
  }
});
