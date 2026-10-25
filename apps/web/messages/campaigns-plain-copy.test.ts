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

describe('Campaigns spend, tab and recommendation copy', () => {
  for (const [name, bundle] of [['en', en], ['he', he]] as const) {
    it(`${name}: spend messages have no data-plumbing jargon`, () => {
      for (const text of Object.values(bundle.Campaigns.spendCockpitDegraded)) {
        expect(text).not.toMatch(/warehouse|quota|quer|מחסן|שאילתות|מכסה/i);
      }
    });
    it(`${name}: tab and recommendation do not use the ROAS acronym`, () => {
      expect(bundle.Campaigns.tabAnalytics).not.toMatch(/ROAS/);
      expect(bundle.Campaigns.proactiveRecommendationDesc).not.toMatch(/ROAS/);
    });
  }
});

describe('Ads & results headline names', () => {
  for (const [name, bundle] of [['en', en], ['he', he]] as const) {
    it(`${name}: the scorecards and table column do not show ROAS or CPA`, () => {
      for (const key of ['metricBlendedRoas', 'metricBlendedCpa', 'columnRoas'] as const) {
        expect(bundle.Campaigns[key]).not.toMatch(/ROAS|CPA|\(/);
      }
    });
  }
});

describe('Ads & results counts say sign-ups or sales, not conversions', () => {
  for (const [name, bundle] of [['en', en], ['he', he]] as const) {
    it(`${name}: no conversion/impression/CVR jargon in the count lines`, () => {
      for (const key of [
        'conversionsCount',
        'conversionsCountShort',
        'analyticsConversionRate',
        'analyticsTotalImpressions',
        'analyticsTotalConversions',
      ] as const) {
        expect(bundle.Campaigns[key]).not.toMatch(/conv|CVR|impression|המרה|המרות|חשיפות/i);
      }
    });
  }
});
