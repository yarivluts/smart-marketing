import { describe, expect, it } from 'vitest';
import { routing, getDirection } from './routing';

describe('routing', () => {
  it('defines en and he locales with en as the default', () => {
    expect(routing.locales).toEqual(['en', 'he']);
    expect(routing.defaultLocale).toBe('en');
  });

  it('marks he as rtl and en as ltr', () => {
    expect(getDirection('he')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });

  it('defaults unrecognized locales to ltr', () => {
    expect(getDirection('fr')).toBe('ltr');
  });
});
