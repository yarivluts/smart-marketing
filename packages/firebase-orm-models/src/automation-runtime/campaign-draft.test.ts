import { describe, expect, it } from 'vitest';
import type { CampaignDraft, GoogleAdsCampaignDraft } from './executor';
import { InvalidCampaignDraftError, validateCampaignDraft } from './campaign-draft';

function validDraft(overrides: Partial<GoogleAdsCampaignDraft> = {}): GoogleAdsCampaignDraft {
  return {
    platform: 'google_ads',
    campaignName: 'Winning Themes',
    advertisingChannelType: 'SEARCH',
    dailyBudgetUsd: 25,
    adGroups: [
      {
        name: 'Ad Group 1',
        keywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
        negativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
        responsiveSearchAd: {
          headlines: ['Buy Blue Widgets', 'Best Widgets Online', 'Widgets For Less'],
          descriptions: ['Free shipping on all widgets.', 'Order today, ships tomorrow.'],
          finalUrl: 'https://example.com/widgets',
        },
      },
    ],
    ...overrides,
  };
}

describe('validateCampaignDraft', () => {
  it('accepts a well-formed Search campaign draft', () => {
    expect(() => validateCampaignDraft(validDraft())).not.toThrow();
  });

  it('rejects a blank campaign name', () => {
    expect(() => validateCampaignDraft(validDraft({ campaignName: '  ' }))).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-positive daily budget', () => {
    expect(() => validateCampaignDraft(validDraft({ dailyBudgetUsd: 0 }))).toThrow(InvalidCampaignDraftError);
  });

  it('rejects Performance Max (not supported yet)', () => {
    expect(() =>
      validateCampaignDraft(validDraft({ advertisingChannelType: 'PERFORMANCE_MAX' as GoogleAdsCampaignDraft['advertisingChannelType'] })),
    ).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a draft with no ad groups', () => {
    expect(() => validateCampaignDraft(validDraft({ adGroups: [] }))).toThrow(InvalidCampaignDraftError);
  });

  it('rejects fewer than 3 headlines', () => {
    const draft = validDraft();
    draft.adGroups[0].responsiveSearchAd.headlines = ['Only One', 'Only Two'];
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a headline over 30 characters', () => {
    const draft = validDraft();
    draft.adGroups[0].responsiveSearchAd.headlines[0] = 'This headline is definitely way too long';
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects fewer than 2 descriptions', () => {
    const draft = validDraft();
    draft.adGroups[0].responsiveSearchAd.descriptions = ['Only one description.'];
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-http(s) final URL', () => {
    const draft = validDraft();
    draft.adGroups[0].responsiveSearchAd.finalUrl = 'not-a-url';
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects an ad group with no keywords', () => {
    const draft = validDraft();
    draft.adGroups[0].keywords = [];
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects an unknown keyword match type', () => {
    const draft = validDraft();
    draft.adGroups[0].keywords[0] = { text: 'blue widgets', matchType: 'FUZZY' as GoogleAdsCampaignDraft['adGroups'][0]['keywords'][0]['matchType'] };
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('allows an ad group with no negative keywords', () => {
    const draft = validDraft();
    draft.adGroups[0].negativeKeywords = [];
    expect(() => validateCampaignDraft(draft)).not.toThrow();
  });

  it('rejects a malformed ad group entry (e.g. from an untrusted request body) without throwing an unhandled error', () => {
    const draft = validDraft();
    // Simulates the campaign-drafts route's unsafe `draft as CampaignDraft` cast of an arbitrary JSON body.
    draft.adGroups = [
      null as unknown as GoogleAdsCampaignDraft['adGroups'][0],
      'not-an-object' as unknown as GoogleAdsCampaignDraft['adGroups'][0],
    ];
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a malformed keyword entry without throwing an unhandled error', () => {
    const draft = validDraft();
    draft.adGroups[0].keywords = [null as unknown as GoogleAdsCampaignDraft['adGroups'][0]['keywords'][0]];
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-array responsiveSearchAd.headlines without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adGroups[0].responsiveSearchAd as unknown as { headlines: unknown }).headlines = 'not-an-array';
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-array negativeKeywords without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adGroups[0] as unknown as { negativeKeywords: unknown }).negativeKeywords = 'free';
    expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('collects every violation at once rather than failing on the first', () => {
    const draft = validDraft({ campaignName: '', dailyBudgetUsd: -1 });
    try {
      validateCampaignDraft(draft);
      expect.fail('expected validateCampaignDraft to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCampaignDraftError);
      const reasons = (error as InvalidCampaignDraftError).reasons;
      expect(reasons.length).toBeGreaterThanOrEqual(2);
    }
  });

  describe('platform dispatch (KAN-73)', () => {
    it('defaults a missing platform field to google_ads, for backward compatibility', () => {
      const draft = validDraft();
      delete (draft as Partial<GoogleAdsCampaignDraft>).platform;
      expect(() => validateCampaignDraft(draft)).not.toThrow();
    });

    it('rejects an unrecognized platform value without throwing an unhandled error', () => {
      const draft = { ...validDraft(), platform: 'tiktok' } as unknown as CampaignDraft;
      expect(() => validateCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
    });

    it('rejects a non-object draft without throwing an unhandled error', () => {
      expect(() => validateCampaignDraft(null as unknown as CampaignDraft)).toThrow(InvalidCampaignDraftError);
      expect(() => validateCampaignDraft('not-an-object' as unknown as CampaignDraft)).toThrow(InvalidCampaignDraftError);
      expect(() => validateCampaignDraft([] as unknown as CampaignDraft)).toThrow(InvalidCampaignDraftError);
    });

    it('dispatches a platform: "meta" draft to the Meta validator', () => {
      const metaDraft: CampaignDraft = {
        platform: 'meta',
        campaignName: 'Meta Campaign',
        objective: 'OUTCOME_TRAFFIC',
        dailyBudgetUsd: 10,
        adSets: [],
      };
      // adSets: [] is invalid for Meta (mirrors "adGroups must have at least one"), proving dispatch actually happened.
      expect(() => validateCampaignDraft(metaDraft)).toThrow(InvalidCampaignDraftError);
    });
  });
});
