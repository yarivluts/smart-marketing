import { describe, expect, it } from 'vitest';
import he from './he.json';

// The Hebrew TikTok help lines name the ad tool in Hebrew, like the Facebook ones do.
describe('Connections Hebrew TikTok help names the ad tool in Hebrew', () => {
  const c = he.Connections;
  it('uses the Hebrew name, not "Ads Manager" in Latin letters', () => {
    for (const t of [c.fields.advertiserId.help, c.platforms.tiktok_ads.steps['3']]) {
      expect(t).toContain('מנהל המודעות של טיקטוק');
      expect(t).not.toMatch(/Ads Manager/);
    }
  });
});
