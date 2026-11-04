import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'eyebrow',
  'description',
  'connectionsTitle',
  'connectionsDescription',
  'noConnections',
  'statusManual',
] as const;

describe('Facebook/Instagram connection page speaks plainly', () => {
  it('en: names Facebook and Instagram, not "Meta", "vault" or "token"', () => {
    for (const key of KEYS) {
      expect(en.MetaConnect[key], key).not.toMatch(/\bMeta\b|vault|token/i);
    }
    expect(en.MetaConnect.noConnections).toMatch(/Facebook and Instagram/);
  });

  it('he: names Facebook and Instagram, not Latin "Meta" or the loanword for token', () => {
    for (const key of KEYS) {
      expect(he.MetaConnect[key], key).not.toMatch(/Meta|טוקן|כספת/);
    }
    // "פייסבוק ואינסטגרם" = Facebook and Instagram
    expect(he.MetaConnect.noConnections).toMatch(/פייסבוק ואינסטגרם/);
  });
});
