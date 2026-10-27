import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = [
  'builtinPackSaasDescription',
  'builtinPackEngagementDescription',
  'builtinPackFeedbackDescription',
  'builtinPackChurnReasonDescription',
  'builtinPackQualityScoreDescription',
  'builtinPackFirmographicDescription',
  'builtinPackExperimentDescription',
  'builtinPackSupportDescription',
  'builtinPackCampaignOpsDescription',
];

describe('built-in pack descriptions', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: say what you get in plain words, not marketing acronyms', (_l, messages) => {
    const plugins = (messages as unknown as Copy).ProjectPlugins;
    for (const key of KEYS) {
      expect(plugins[key], key).toBeTruthy();
      expect(plugins[key], key).not.toMatch(/\b(CAC|CPS|MRR|DAU|WAU|MAU|CSAT|schema|significance|control|first-response|fixed-window|cohort|churn|histograms?)\b|סכמת|מובהקות|ביקורת|בחלון זמן קבוע|קוהורט|היסטוגרמ|דביקות/i);
    }
  });

  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: pack titles are not tool jargon', (_l, messages) => {
    const plugins = (messages as unknown as Copy).ProjectPlugins;
    for (const key of ['builtinPackFirmographicTitle', 'builtinPackCampaignOpsTitle']) {
      expect(plugins[key], key).toBeTruthy();
      expect(plugins[key], key).not.toMatch(/firmographic|campaign ops|enrichment|פירמוגרפ|תפעול|העשרת/i);
    }
  });
});
