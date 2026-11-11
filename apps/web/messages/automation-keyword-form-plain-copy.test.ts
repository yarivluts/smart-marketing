import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'proposeDraftAdGroupNameLabel',
  'proposeKeywordEditNoTargetsNote',
  'proposeKeywordEditAdGroupLabel',
  'proposeKeywordEditAddNegativeKeywordsLabel',
  'proposeKeywordEditEmptyError',
  'diffFieldAdGroupResourceName',
] as const;

describe('automation keyword form copy', () => {
  const auto = en.Automation as Record<string, string>;
  const autoHe = he.Automation as Record<string, string>;

  it('avoids the ad-platform terms "ad group" and "negative keyword" in English', () => {
    for (const key of KEYS) {
      expect(auto[key], key).not.toMatch(/ad group|negative/i);
    }
  });

  it('explains what a word to avoid does, in both languages', () => {
    expect(auto.proposeKeywordEditAddNegativeKeywordsLabel).toMatch(/not shown/);
    expect(autoHe.proposeKeywordEditAddNegativeKeywordsLabel).not.toMatch(/שליל/);
    expect(autoHe.proposeKeywordEditEmptyError).not.toMatch(/שליל/);
  });
});
