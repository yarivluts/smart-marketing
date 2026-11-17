import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Compare versions: setup lines use the page name, not "A/B"', () => {
  it.each([
    ['en', en, 'version comparison'],
    ['he', he, 'השוואת גרסאות'],
  ])('%s: intro and install title', (_l, m, name) => {
    const c = (m as unknown as Copy).Experiments;
    for (const value of [c.setupIntro, c.installTitle]) {
      expect(value.toLowerCase()).toContain(name);
      expect(value).not.toMatch(/A\/B/);
    }
  });
});
