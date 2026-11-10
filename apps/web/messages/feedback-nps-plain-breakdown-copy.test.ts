import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe.each([
  ['en', (en as unknown as Copy).Feedback],
  ['he', (he as unknown as Copy).Feedback],
])('NPS page breakdown is understandable to a newcomer (%s)', (_l, m) => {
  it('the breakdown line says in words how each group feels, and keeps the placeholders', () => {
    for (const p of ['{promoters}', '{passives}', '{detractors}', '{total}']) {
      expect(m.npsBreakdownLine).toContain(p);
    }
    expect(m.npsBreakdownLine).toMatch(/\([^)]+\)/);
  });

  it('the chart heading is not the word sentiment', () => {
    expect(m.sentimentHeading).not.toMatch(/sentiment|סנטימנט/i);
  });
});
