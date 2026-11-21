import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'proposeMetaAdSetEditNoTargetsNote',
  'proposeMetaAdSetTargetingEditNoTargetsNote',
  'proposeMetaAdCreativeEditNoTargetsNote',
] as const;

describe('"no ads yet" notes of the Facebook edit forms', () => {
  const auto = en.Automation as Record<string, string>;
  const autoHe = he.Automation as Record<string, string>;

  it('say to propose and approve a draft, not to "run" one', () => {
    for (const key of KEYS) {
      expect(auto[key], key).toMatch(/propose .*approve/);
      expect(auto[key], key).not.toMatch(/\brun\b/i);
      expect(autoHe[key], key).not.toMatch(/הפעיל/);
      expect(autoHe[key], key).toMatch(/אשרו/);
    }
  });
});
