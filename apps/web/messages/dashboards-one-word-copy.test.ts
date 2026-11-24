import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const stringsOf = (ns: Record<string, unknown>) =>
  Object.values(ns).filter((v): v is string => typeof v === 'string');

describe('the Dashboards and TV pages call them dashboards, like the menu', () => {
  it('never says "board" in English on those two pages', () => {
    for (const text of [...stringsOf(en.Boards), ...stringsOf(en.TvPairing)]) {
      expect(text).not.toMatch(/\bboards?\b/i);
    }
  });

  it('keeps the menu name and the page words the same', () => {
    expect(en.Boards.createButton).toBe('Create dashboard');
    expect(en.Boards.noBoards).toBe('This project has no dashboards yet.');
    expect(en.TvPairing.noBoards).toBe('Create a dashboard first to pair a TV.');
  });

  it('says "dashboard" (לוח מחוונים) wherever Hebrew names one on those pages', () => {
    for (const text of [...stringsOf(he.Boards), ...stringsOf(he.TvPairing)]) {
      expect(text).not.toMatch(/(^|[\s"'(])ה?לוחות?(?![ א-ת]*מחוונים)(?=[\s".,:)]|$)/);
    }
    expect(he.TvPairing.noBoards).not.toContain('לצמד');
  });
});
