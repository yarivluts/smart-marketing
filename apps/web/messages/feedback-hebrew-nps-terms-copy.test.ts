import { describe, expect, it } from 'vitest';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Hebrew NPS page: one name for each group, plain empty state', () => {
  const m = (he as unknown as Copy).Feedback;
  const names = ['kpiPromoters', 'kpiDetractors'].map((k) => m[k]);

  it('the breakdown line uses the same group names as the labels and cards', () => {
    expect(names).toHaveLength(2);
    for (const name of names) {
      expect(m.npsBreakdownLine).toContain(name);
      expect(m.setupFeatureNpsDescription).toContain(name);
    }
  });

  it('does not mix in a second set of names for the same groups', () => {
    const all = Object.values(m).join(' ');
    expect(all).not.toMatch(/תומכים|מסתייגים/);
  });

  it('the empty state says customer ratings, not NPS responses', () => {
    expect(m.npsEmpty).not.toMatch(/NPS/);
  });
});
