import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('A/B tests: one name everywhere', () => {
  it.each([
    ['en', en, 'A/B tests', /experiment/i],
    ['he', he, 'בדיקות A/B', /ניסוי/],
  ])('%s: page label, counter and install pack all say the same name', (_l, m, name, old) => {
    const c = m as unknown as Copy;
    for (const value of [
      c.Experiments.eyebrow,
      c.Experiments.kpiExperiments,
      c.Experiments.metaTitle,
      c[Object.keys(c).find((k) => 'builtinPackExperimentTitle' in c[k])!].builtinPackExperimentTitle,
    ]) {
      expect(value).toContain(name);
      expect(value).not.toMatch(old);
    }
  });
});
