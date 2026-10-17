import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['noCampaigns', 'stateSourceNote', 'noCreativesYet'] as const;

describe('Campaigns beginner copy', () => {
  for (const [name, bundle] of [['en', en], ['he', he]] as const) {
    it.each(KEYS)(`${name}: %s has no ticket ids or developer jargon`, (key) => {
      const text = bundle.Campaigns[key];
      expect(text).not.toMatch(/KAN-\d+/);
      expect(text).not.toMatch(/\bAPI\b/);
      expect(text.toLowerCase()).not.toMatch(/seed|target/);
    });
  }

  it('the empty campaigns list points a beginner to Growth Pilot in both languages', () => {
    expect(en.Campaigns.noCampaigns).toContain('Growth Pilot');
    expect(he.Campaigns.noCampaigns).toContain(he.AppShell.growthPilot);
  });
});
