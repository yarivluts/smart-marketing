import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'intro',
  'slugLabel',
  'slugHelp',
  'kpiProfile',
  'profileTitle',
  'profileSlug',
  'relatedPlugins',
] as const;

describe('organization settings copy', () => {
  it('has no developer words in either language', () => {
    for (const key of KEYS) {
      expect(en.OrganizationSettings[key], key).not.toMatch(/slug|completeness|manifest|identifier|profile/i);
      expect(he.OrganizationSettings[key], key).not.toMatch(/slug|שלמות|מניפסט|מזהה|פרופיל/i);
    }
  });

  it('keeps the placeholders the page fills in', () => {
    expect(en.OrganizationSettings.kpiProfileSubtext).toMatch(/\{filled\}.*\{total\}/);
    expect(he.OrganizationSettings.kpiProfileSubtext).toMatch(/\{filled\}.*\{total\}/);
  });
});
