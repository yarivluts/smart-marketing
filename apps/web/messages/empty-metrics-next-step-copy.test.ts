import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Goals and dashboards: no numbers yet points to the menu', () => {
  it.each([
    ['en', en, 'Your key numbers', /register a metric/i],
    ['he', he, 'המספרים החשובים שלכם', /לרשום מדד/],
  ])('%s: both empty lines name the menu entry in plain words', (_l, m, menu, jargon) => {
    const c = m as unknown as Copy;
    for (const value of [c.Boards.noMetricsRegistered, c.Goals.noMetricsRegistered]) {
      expect(value).toContain(menu);
      expect(value).not.toMatch(jargon);
    }
  });
});
