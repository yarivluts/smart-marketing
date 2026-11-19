import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, unknown>>;

describe('Wins: one plain word, no "rule"', () => {
  it.each([
    ['en', en, /win rule/i],
    ['he', he, /כלל(י)? (ה)?(ניצחון|זכייה|הצלחה)|כללי הזכייה/],
  ])('%s: Alerts and wins and Celebrate wins copy do not say rule', (_l, m, bad) => {
    const c = m as unknown as Copy;
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(c.Insights);
    walk(c.WinRules);
    for (const s of strings) expect(s).not.toMatch(bad);
  });
});
