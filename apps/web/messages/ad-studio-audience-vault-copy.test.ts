import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio audience step: unavailable-login message is about the audience', () => {
  it('does not talk about search volumes (that is the keyword step) in en', () => {
    const text = en.AdStudio.audience.unavailable.vault_not_configured;
    expect(text).not.toMatch(/search volumes/i);
    expect(text).toMatch(/groups of people/i);
    expect(text).toMatch(/try again later/i);
  });

  it('does the same in he, and calls gender "מגדר" everywhere in this step', () => {
    const a = he.AdStudio.audience;
    expect(a.unavailable.vault_not_configured).not.toContain('נתוני חיפוש');
    expect(a.unavailable.vault_not_configured).toContain('קבוצות האנשים');
    expect(a.noAudiences).toContain('מגדר');
    expect(a.noAudiences).not.toContain('מין');
  });
});
