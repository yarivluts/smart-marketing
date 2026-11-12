import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The Hebrew failure reasons name the ad tool in Hebrew, like the links next to them.
describe('Growth Pilot Hebrew reasons name the ad tool in Hebrew', () => {
  const r = he.GrowthPilot.reasons;
  it('uses the Hebrew name, not Latin letters', () => {
    for (const t of [r.account_action_required, r.meta_account_restricted]) {
      expect(t).toContain('מנהל המודעות של פייסבוק');
      expect(t).toContain('adsmanager.facebook.com');
      expect(t.replace('adsmanager.facebook.com', '')).not.toMatch(/[A-Za-z]/);
    }
  });
  it('keeps the same keys as English', () => {
    expect(Object.keys(r).sort()).toEqual(Object.keys(en.GrowthPilot.reasons).sort());
  });
});
