import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const DUNNING_KEYS = [
  'dunningHeading',
  'dunningEmpty',
  'dunningCapNote',
  'dunningCapNoteTruncated',
  'kpiAtRiskSub',
] as const;

describe('Billing ops feed names failed payments in plain words', () => {
  it.each(DUNNING_KEYS)('English %s avoids the word "dunning"', (key) => {
    const text = en.BillingOpsFeed[key];
    expect(text.replace(/\{\w+\}/g, '')).not.toMatch(/dunning/i);
    expect(text.length).toBeGreaterThan(0);
  });

  it.each(DUNNING_KEYS)('Hebrew %s is Hebrew and keeps the same placeholders', (key) => {
    const text = he.BillingOpsFeed[key];
    expect(text).toMatch(/[֐-׿]/);
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    expect(placeholders(text)).toEqual(placeholders(en.BillingOpsFeed[key]));
  });
});
