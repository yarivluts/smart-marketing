import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const say = (locale: 'en' | 'he', key: string, count: number): string =>
  createTranslator({ locale, messages: locale === 'en' ? en : he, namespace: 'Onboarding' } as never)(key as never, { count } as never);

describe('Onboarding data step handles a single record', () => {
  it('says "1 activity record", not "1 activity records" (en)', () => {
    expect(say('en', 'sourceStepEventsReceived', 1)).toMatch(/^1 activity record received/);
    expect(say('en', 'sourceStepEventsReceived', 4)).toMatch(/^4 activity records received/);
  });

  it('says "1 record ... was set aside" (en)', () => {
    expect(say('en', 'sourceStepQuarantined', 1)).toBe('1 record could not be used and was set aside.');
    expect(say('en', 'sourceStepQuarantined', 2)).toBe('2 records could not be used and were set aside.');
  });

  it('has a real singular in Hebrew', () => {
    for (const key of ['sourceStepEventsReceived', 'sourceStepQuarantined']) {
      expect(say('he', key, 1)).not.toContain('1');
      expect(say('he', key, 1)).not.toBe(say('he', key, 3));
      expect(say('he', key, 3)).toContain('3');
    }
  });
});
