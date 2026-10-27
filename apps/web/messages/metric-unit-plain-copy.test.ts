import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Registry = { unitHelp: string; unitOption: Record<string, string> };

const registry = (m: unknown) => (m as { MetricRegistry: Registry }).MetricRegistry;

describe('Metric editor: plain unit words', () => {
  it('en: no "fraction" or "ratio" maths in the unit choices or help', () => {
    const m = registry(en);
    for (const text of [m.unitHelp, ...Object.values(m.unitOption)]) {
      expect(text).not.toMatch(/fraction|\bratio\b|0-1/i);
    }
  });

  it('he: the unit choices and help avoid "יחס" and "שבר"', () => {
    const m = registry(he);
    for (const text of [m.unitHelp, ...Object.values(m.unitOption)]) {
      expect(text).not.toMatch(/יחס|שבר/);
    }
  });

  it('the rate option says it is shown as a percent', () => {
    expect(registry(en).unitOption.ratio).toContain('percent');
  });
});
