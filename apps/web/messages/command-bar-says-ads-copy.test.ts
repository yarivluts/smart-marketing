import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Command bar and change history say ads, not campaigns', () => {
  for (const [name, bundle, word] of [
    ['en', en, /campaign/i],
    ['he', he, /קמפיין/],
  ] as const) {
    it(`${name}: command bar ad entries and the history search avoid "campaign"`, () => {
      const bar = bundle.CommandBar;
      expect(bar.navAds).not.toMatch(word);
      expect(bar.askSpendQuery).not.toMatch(word);
      expect(bundle.ActionAuditTrail.searchPlaceholder).not.toMatch(word);
    });
  }
});
