import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('A/B tests: "No data" cards say why', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s: has a reason line next to the "No data" value, with no raw codes', (_l, m) => {
    const c = (m as unknown as Copy).Experiments;
    expect(c.kpiNoDataSub.length).toBeGreaterThan(20);
    expect(c.kpiNoDataSub).not.toMatch(/[a-z]+_[a-z_]+|\{/);
  });

  it('en: tells what happens next', () => {
    expect((en as unknown as Copy).Experiments.kpiNoDataSub).toMatch(/once your data is connected/);
  });
});
