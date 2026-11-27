import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Public = Record<string, string>;
type Manage = Record<string, string>;
type Copy = { AdShare: { public: Public; manage: Manage } };

const KEYS = [
  ['public', 'resultsHeading'],
  ['public', 'resultsIntro'],
  ['public', 'activeCampaignsLabel'],
  ['public', 'campaignColumn'],
  ['public', 'approveCampaignButton'],
  ['public', 'campaignDraftsHeading'],
  ['public', 'campaignDraftPlatformMeta'],
  ['public', 'campaignDraftPlatformGoogle'],
  ['manage', 'includeResultsOption'],
] as const;

describe('shared ads page: says "ad", not "campaign"', () => {
  it.each([
    ['en', en, /campaign|metrics/i],
    ['he', he, /קמפיין|קמפיינ/],
  ])('%s: client-facing lines use the plain word for ads', (_l, messages, jargon) => {
    const share = (messages as unknown as Copy).AdShare;
    for (const [group, key] of KEYS) {
      const value = share[group][key];
      expect(value, `${group}.${key}`).toBeTruthy();
      expect(value, `${group}.${key}`).not.toMatch(jargon);
    }
  });
});
