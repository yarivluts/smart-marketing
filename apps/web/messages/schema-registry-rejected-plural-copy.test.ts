import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('SchemaRegistry.eventRejectedCount handles a single record', () => {
  const say = (locale: 'en' | 'he', count: number): string =>
    createTranslator({ locale, messages: locale === 'en' ? en : he, namespace: 'SchemaRegistry' } as never)('eventRejectedCount', { count });

  it('says "1 record was", not "1 records were" (en)', () => {
    expect(say('en', 1)).toMatch(/^1 record was rejected/);
    expect(say('en', 3)).toMatch(/^3 records were rejected/);
  });

  it('has a distinct singular and plural form in Hebrew', () => {
    expect(say('he', 1)).not.toContain('1');
    expect(say('he', 1)).not.toBe(say('he', 3));
    expect(say('he', 3)).toMatch(/^3 /);
  });
});
