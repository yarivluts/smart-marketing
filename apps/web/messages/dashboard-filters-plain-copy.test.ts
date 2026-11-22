import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Dashboard filters speak plain words', () => {
  it('English avoids "global" and "queries"', () => {
    expect(en.Boards.globalFiltersLabel).not.toMatch(/global/i);
    expect(en.Boards.noGlobalFilters).not.toMatch(/global|quer|unfiltered/i);
  });

  it('Hebrew avoids the technical word for global and querying', () => {
    expect(he.Boards.globalFiltersLabel).not.toMatch(/גלובליים/);
    expect(he.Boards.noGlobalFilters).not.toMatch(/גלובליים|שואל/);
  });
});
