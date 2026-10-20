import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const introKeys = [
  'packStepIntro',
  'packSaasMarketingDescription',
  'packEngagementDescription',
  'sourceStepIntro',
  'sourceStepNoEventsYet',
  'funnelStepIntro',
  'startHint',
] as const;

describe('onboarding intro copy explains itself to a beginner', () => {
  it('exists in both languages for every key', () => {
    for (const key of introKeys) {
      expect(en.Onboarding[key]).toBeTruthy();
      expect(he.Onboarding[key]).toBeTruthy();
    }
  });

  it('spells out every abbreviation next to the term', () => {
    expect(en.Onboarding.packSaasMarketingDescription).toMatch(/cost per customer \(CAC\)/);
    expect(en.Onboarding.packSaasMarketingDescription).toMatch(/recurring revenue \(MRR\)/);
    expect(en.Onboarding.packEngagementDescription).toMatch(/each day, week and month \(DAU\/WAU\/MAU\)/);
    expect(en.Onboarding.sourceStepIntro).toMatch(/using an access key/);
    expect(en.Onboarding.sourceStepIntro).not.toMatch(/API/);
    expect(he.Onboarding.sourceStepIntro).not.toMatch(/API/);
    expect(en.Onboarding.sourceStepPushYourOwnHeading).not.toMatch(/push/i);
  });

  it('does not lead with plugin / ingest / funnel jargon', () => {
    for (const key of ['sourceStepIntro', 'sourceStepNoEventsYet', 'startHint'] as const) {
      expect(en.Onboarding[key]).not.toMatch(/plugin|ingest|funnel/i);
    }
  });

  it('says the send-your-own-data intro without "mint" or "plugin"', () => {
    expect(en.Onboarding.sourceStepPushYourOwnIntro).not.toMatch(/mint|plugin|events/i);
    expect(he.Onboarding.sourceStepPushYourOwnIntro).toMatch(/[֐-׿]/);
    expect(he.Onboarding.sourceStepPushYourOwnIntro).not.toMatch(/תוסף/);
  });

  it('keeps the Hebrew free of the funnel metaphor and in Hebrew', () => {
    expect(he.Onboarding.startHint).not.toMatch(/משפך/);
    for (const key of introKeys) {
      expect(he.Onboarding[key]).toMatch(/[֐-׿]/);
    }
  });
});
