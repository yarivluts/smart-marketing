import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;
const JARGON_EN = /CAC|CPS|mix-shift|cohort|warehouse|pack|Intent/i;
const JARGON_HE = /קוהורט|תמהיל|מחסן|חבילת|כוונה/;

const visibleKeys = [
  'metaTitle',
  'title',
  'description',
  'setupIntro',
  'setupInstallTitle',
  'adjustedMetricsHeading',
  'adjustedMetricsEmpty',
  'qualityAdjustedCostPerSignupLabel',
  'qualityAdjustedCacLabel',
  'mixAlertsHeading',
  'mixAlertsEmpty',
  'byChannelEmpty',
  'byCohortHeading',
  'byCohortEmpty',
  'setupFeatureChannelsTitle',
  'setupFeatureAlertsTitle',
  'kpiActiveAlerts',
] as const;

describe('the signup quality page speaks plain words', () => {
  it('English has no marketing or data jargon, and the sidebar matches the page title', () => {
    for (const key of visibleKeys) expect(en.IntentQuality[key], key).not.toMatch(JARGON_EN);
    expect(en.OrgDetailPage.projectIntentQualityLink).toBe(en.IntentQuality.metaTitle);
    expect(en.IntentQuality.title).toContain('{projectName}');
  });

  it('Hebrew is Hebrew, has no jargon, and the sidebar matches the page title', () => {
    for (const key of visibleKeys) {
      expect(he.IntentQuality[key], key).toMatch(HEBREW);
      expect(he.IntentQuality[key], key).not.toMatch(JARGON_HE);
    }
    expect(he.OrgDetailPage.projectIntentQualityLink).toBe(he.IntentQuality.metaTitle);
    expect(he.IntentQuality.title).toContain('{projectName}');
  });
});
