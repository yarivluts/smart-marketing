import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('command search badges never suggest that ads are already running', () => {
  it('says the results page is up to date instead of "Live"', () => {
    expect(en.CommandPalette.badgeLive).toBe('Up to date');
    expect(he.CommandPalette.badgeLive).toBe('מעודכן');
  });
});
