import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const pickCopy = (g: typeof en.GrowthPilot) => [
  g.audience.metaMissing,
  g.publish.description,
  g.publish.status.needs_meta,
  g.performance.unavailableMeta,
];

describe('Growth Pilot does not make a beginner learn the word "Meta"', () => {
  it('names Facebook and Instagram without a bracketed company name (en + he)', () => {
    for (const text of [...pickCopy(en.GrowthPilot), ...pickCopy(he.GrowthPilot as typeof en.GrowthPilot)]) {
      expect(text).not.toMatch(/\(Meta\)/);
    }
  });

  it('still says Facebook and Instagram', () => {
    for (const text of pickCopy(en.GrowthPilot)) expect(text).toMatch(/Facebook and Instagram/);
    for (const text of pickCopy(he.GrowthPilot as typeof en.GrowthPilot)) expect(text).toMatch(/פייסבוק.*אינסטגרם/);
  });
});
