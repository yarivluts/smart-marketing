import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Dashboard, goal and group create/delete failures', () => {
  it.each([
    ['en', en, /Nothing was created/, /Nothing was deleted/, /internet connection/],
    ['he', he, /שום דבר לא נוצר/, /שום דבר לא נמחק/, /חיבור לאינטרנט/],
  ])('%s: say nothing changed and what to check', (_l, m, created, deleted, next) => {
    const c = m as unknown as Copy;
    for (const ns of ['Boards', 'Goals', 'Segments']) {
      expect(c[ns].createError).toMatch(created);
      expect(c[ns].createError).toMatch(next);
      expect(c[ns].deleteError).toMatch(deleted);
      expect(c[ns].deleteError).toMatch(next);
    }
  });
});
