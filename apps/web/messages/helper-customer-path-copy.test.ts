import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  ['CommandBar', 'askFunnelLabel'],
  ['CommandBar', 'askFunnelQuery'],
] as const;

describe('AI helper suggestions talk about the customer path, not a funnel', () => {
  it.each(KEYS)('English %s.%s avoids "funnel"', (ns, key) => {
    expect(en[ns][key]).not.toMatch(/funnel/i);
  });

  it.each(KEYS)('Hebrew %s.%s avoids the word for funnel', (ns, key) => {
    expect(he[ns][key]).not.toMatch(/\u05DE\u05E9\u05E4\u05DA/);
    expect(he[ns][key]).toMatch(/[\u0590-\u05FF]/);
  });
});
