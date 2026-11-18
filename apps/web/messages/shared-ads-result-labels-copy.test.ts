import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Public = Record<string, string>;
const pub = (m: unknown): Public => (m as { AdShare: { public: Public } }).AdShare.public;

describe('shared ads page: result labels a client can read', () => {
  it.each([
    ['en', en, /ROAS|CTR|Conversions|Meta/],
    ['he', he, /ROAS|CTR|Meta|המרות/],
  ])('%s: no marketing abbreviations in the results table', (_l, m, jargon) => {
    const c = pub(m);
    for (const key of ['metaSpendLabel', 'roasColumn', 'ctrColumn', 'conversionsColumn', 'platformMeta']) {
      expect(c[key], key).toBeTruthy();
      expect(c[key], key).not.toMatch(jargon);
    }
  });

  it('en: says what each number is in plain words', () => {
    const c = pub(en);
    expect(c.roasColumn).toBe('Money back per $1');
    expect(c.ctrColumn).toBe('Share who clicked');
    expect(c.conversionsColumn).toBe('Sign-ups or sales');
    expect(c.platformMeta).toBe('Facebook and Instagram');
  });
});
