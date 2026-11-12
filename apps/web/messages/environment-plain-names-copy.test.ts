import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The Hebrew word for "production" also means "manufacturing"; built from escapes (no Hebrew in code).
const HEBREW_PRODUCTION = 'ייצור';

describe('environment names speak plain words', () => {
  it('English says which environment is the real data and which are tests', () => {
    expect(en.EnvBadge.prod).toMatch(/real data/i);
    expect(en.EnvBadge.dev).toMatch(/test/i);
    expect(en.EnvBadge.staging).toMatch(/test/i);
  });

  it('the not-real-data notice does not use the word "production"', () => {
    expect(en.EnvironmentPicker.nonProdNotice).not.toMatch(/production/i);
    expect(en.EnvironmentPicker.nonProdNotice).toContain('{environment}');
    expect(he.EnvironmentPicker.nonProdNotice).toContain('{environment}');
  });

  it('Hebrew never calls real data "manufacturing"', () => {
    const texts = [he.EnvBadge.prod, he.EnvironmentPicker.hint, he.EnvironmentPicker.nonProdNotice];
    for (const text of texts) expect(text).not.toContain(HEBREW_PRODUCTION);
    expect(he.EnvBadge.prod).not.toBe(he.EnvBadge.dev);
  });
});
