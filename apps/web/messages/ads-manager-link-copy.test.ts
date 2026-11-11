import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The link to the ad tool uses the name a newcomer knows (Facebook), not the company name "Meta".
describe('Ads Manager links say Facebook, not Meta', () => {
  const texts = (m: typeof en | typeof he) => {
    const g = m.GrowthPilot as unknown as Record<string, any>;
    return [
      g.errors.platform_failed,
      g.publish.status.adsManager,
      g.detail.actions.adsManager.title,
      g.detail.actions.adsManager.why,
      g.detail.adsManagerLink,
    ];
  };
  it('english', () => {
    for (const t of texts(en)) expect(t).not.toMatch(/Meta/);
    expect(texts(en)[1]).toBe('Open in Facebook Ads Manager');
  });
  it('hebrew', () => {
    for (const t of texts(he)) expect(t).not.toMatch(/Meta/);
  });
});
