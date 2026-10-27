import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'warehouseFreshnessHeading',
  'warehouseFreshnessLine',
  'warehouseFreshnessEmpty',
  'warehouseFreshnessNotConfigured',
  'orchestrationHeading',
  'orchestrationNoFreshnessYet',
  'orchestrationNoRuns',
] as const;

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('Data health page avoids warehouse jargon', () => {
  it.each(KEYS)('English %s has no warehouse, BigQuery or orchestration wording', (key) => {
    const text = en.IngestHealth[key].replace(/\{\w+\}/g, '');
    expect(text).not.toMatch(/warehouse|bigquery|orchestration|landed|deployment/i);
  });

  it.each(KEYS)('Hebrew %s is Hebrew and keeps the same placeholders', (key) => {
    const text = he.IngestHealth[key];
    expect(text).toMatch(/[֐-׿]/);
    expect(text).not.toMatch(/bigquery|מחסן|תזמור|נחת/i);
    expect(placeholders(text)).toEqual(placeholders(en.IngestHealth[key]));
  });

  it('page and billing eyebrows are plain in both languages', () => {
    expect(en.IngestHealth.eyebrow).toBe('Your data');
    expect(en.BillingOpsFeed.eyebrow).toBe('Failed payments');
    expect(he.IngestHealth.eyebrow).toBe('הנתונים שלך');
    expect(he.BillingOpsFeed.eyebrow).toBe('תשלומים שנכשלו');
  });
});
