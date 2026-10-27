import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'eyebrow',
  'description',
  'leaderboardEmpty',
  'leaderboardUnattributed',
  'leaderboardUnattributedNoCurrency',
  'noSignals',
  'signalsDescription',
] as const;

describe('the sales-by-team-member page speaks plainly', () => {
  it('English avoids "attribution", "attributed" and "unattributed"', () => {
    for (const key of KEYS) {
      expect(en.RepCollections[key]).not.toMatch(/attribut/i);
    }
  });

  it('Hebrew avoids the "ייחוס" / "שויכו" / "משויכ" wording', () => {
    for (const key of KEYS) {
      expect(he.RepCollections[key]).not.toMatch(/ייחוס|שויכ|משויכ/);
    }
  });

  it('the unattributed lines keep their placeholders', () => {
    expect(en.RepCollections.leaderboardUnattributed).toContain('{currency}');
    expect(he.RepCollections.leaderboardUnattributed).toContain('{currency}');
    expect(en.RepCollections.leaderboardUnattributedNoCurrency).toContain('{count');
  });
});
