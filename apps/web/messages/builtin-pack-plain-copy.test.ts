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
];

describe('built-in pack descriptions', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: say what you get in plain words, not marketing acronyms', (_l, messages) => {
    const plugins = (messages as unknown as Copy).ProjectPlugins;
    for (const key of KEYS) {
      expect(plugins[key], key).toBeTruthy();
      expect(plugins[key], key).not.toMatch(/\b(CAC|CPS|MRR|DAU|WAU|MAU|CSAT|cohort|churn|histograms?)\b|קוהורט|היסטוגרמ|דביקות/i);
    }
  });
});
