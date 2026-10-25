import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Data types page labels avoid developer jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const s = (lang as unknown as Record<string, Record<string, string>>).SchemaRegistry;
    const text = [s.evolve, s.evolveHeading, s.familyMeta, s.fieldPiiHeader, s.piiLabel, s.identityKeyLabel].join('\n').replace(/{pii,/g, '');

    it(`does not use Evolve, PII or Identity key (${name})`, () => {
      expect(text).not.toMatch(name === 'en' ? /evolve|PII|identity key/i : /פיתוח|PII/);
    });
  }
});
