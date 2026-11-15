import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// A newcomer clicks "Ads & results" in the menu; the page they land on must greet them with the same words.
describe('the ads page title matches its menu link', () => {
  it('English', () => {
    expect(en.Campaigns.cockpitTitle).toBe(en.AppShell.adsAndPerformance);
  });

  it('Hebrew', () => {
    expect(he.Campaigns.cockpitTitle).toBe(he.AppShell.adsAndPerformance);
  });
});
