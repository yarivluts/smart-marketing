import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The Growth Pilot failure reasons are dropped into "(…)" inside a sentence, so they must not
// contain brackets of their own, and the Ads Manager address stays easy to find.
describe('Growth Pilot failure reasons do not nest brackets', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const reasons = (lang.GrowthPilot as unknown as { reasons: Record<string, string> }).reasons;
    it(`has no brackets inside any reason (${name})`, () => {
      for (const [code, text] of Object.entries(reasons)) {
        expect(text, code).not.toMatch(/[()]/);
      }
    });
    it(`still gives the Ads Manager address (${name})`, () => {
      expect(reasons.account_action_required).toContain('adsmanager.facebook.com');
      expect(reasons.meta_account_restricted).toContain('adsmanager.facebook.com');
    });
  }
});
