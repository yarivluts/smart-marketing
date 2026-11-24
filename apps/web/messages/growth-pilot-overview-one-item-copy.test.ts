import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot overview line gets the count right', () => {
  const english = createTranslator({ locale: 'en', messages: en });
  const hebrew = createTranslator({ locale: 'he', messages: he });
  const key = 'GrowthPilot.overview.explain';

  it('en: one item reads "the one item", never "the 1 item"', () => {
    const text = english(key as never, { count: 1 });
    expect(text).toBe('Across the one item the pilot is promoting for you.');
    expect(text).not.toMatch(/the 1 item/);
  });

  it('en: several items keep the number', () => {
    expect(english(key as never, { count: 3 })).toBe(
      'Across the 3 items the pilot is promoting for you.',
    );
  });

  it('he: has a separate singular form', () => {
    expect(hebrew(key as never, { count: 1 })).not.toBe(hebrew(key as never, { count: 3 }));
  });
});
