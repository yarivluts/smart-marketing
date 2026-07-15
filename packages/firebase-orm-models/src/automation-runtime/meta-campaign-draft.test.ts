import { describe, expect, it } from 'vitest';
import type { MetaCampaignDraft, MetaCampaignDraftAdSet } from './executor';
import { InvalidCampaignDraftError } from './invalid-campaign-draft-error';
import { validateMetaCampaignDraft } from './meta-campaign-draft';

function validDraft(overrides: Partial<MetaCampaignDraft> = {}): MetaCampaignDraft {
  return {
    platform: 'meta',
    campaignName: 'Summer Sale',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudgetUsd: 25,
    adSets: [
      {
        name: 'Ad Set 1',
        targeting: { countries: ['US', 'CA'], ageMin: 18, ageMax: 45, genders: ['male', 'female'] },
        ad: {
          name: 'Ad 1',
          creative: {
            primaryText: 'Big summer savings on blue widgets.',
            headline: 'Blue Widgets Sale',
            description: 'Shop now',
            linkUrl: 'https://example.com/widgets',
          },
        },
      },
    ],
    ...overrides,
  };
}

describe('validateMetaCampaignDraft', () => {
  it('accepts a well-formed Meta campaign draft', () => {
    expect(() => validateMetaCampaignDraft(validDraft())).not.toThrow();
  });

  it('accepts a draft with no genders specified (all genders)', () => {
    const draft = validDraft();
    delete (draft.adSets[0].targeting as Partial<MetaCampaignDraftAdSet['targeting']>).genders;
    expect(() => validateMetaCampaignDraft(draft)).not.toThrow();
  });

  it('accepts a draft with no description (optional)', () => {
    const draft = validDraft();
    delete (draft.adSets[0].ad.creative as Partial<MetaCampaignDraftAdSet['ad']['creative']>).description;
    expect(() => validateMetaCampaignDraft(draft)).not.toThrow();
  });

  it('rejects a blank campaign name', () => {
    expect(() => validateMetaCampaignDraft(validDraft({ campaignName: '  ' }))).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-positive daily budget', () => {
    expect(() => validateMetaCampaignDraft(validDraft({ dailyBudgetUsd: 0 }))).toThrow(InvalidCampaignDraftError);
  });

  it('rejects an unknown objective', () => {
    expect(() => validateMetaCampaignDraft(validDraft({ objective: 'OUTCOME_APP_PROMOTION' as MetaCampaignDraft['objective'] }))).toThrow(
      InvalidCampaignDraftError,
    );
  });

  it('rejects a draft with no ad sets', () => {
    expect(() => validateMetaCampaignDraft(validDraft({ adSets: [] }))).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a malformed ad set entry (e.g. from an untrusted request body) without throwing an unhandled error', () => {
    const draft = validDraft();
    draft.adSets = [null as unknown as MetaCampaignDraftAdSet, 'not-an-object' as unknown as MetaCampaignDraftAdSet];
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a blank ad set name', () => {
    const draft = validDraft();
    draft.adSets[0].name = '  ';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-object targeting without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adSets[0] as unknown as { targeting: unknown }).targeting = 'not-an-object';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-array countries without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adSets[0].targeting as unknown as { countries: unknown }).countries = 'US';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects an empty countries array', () => {
    const draft = validDraft();
    draft.adSets[0].targeting.countries = [];
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a malformed country code entry without throwing an unhandled error', () => {
    const draft = validDraft();
    draft.adSets[0].targeting.countries = [null as unknown as string, 'usa', 123 as unknown as string];
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects an ageMin below 13', () => {
    const draft = validDraft();
    draft.adSets[0].targeting.ageMin = 10;
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects an ageMax above 65', () => {
    const draft = validDraft();
    draft.adSets[0].targeting.ageMax = 70;
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects ageMin greater than ageMax', () => {
    const draft = validDraft();
    draft.adSets[0].targeting.ageMin = 40;
    draft.adSets[0].targeting.ageMax = 30;
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-array genders without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adSets[0].targeting as unknown as { genders: unknown }).genders = 'male';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a malformed genders entry without throwing an unhandled error', () => {
    const draft = validDraft();
    draft.adSets[0].targeting.genders = ['nonbinary' as unknown as 'male', null as unknown as 'male'];
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-object ad without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adSets[0] as unknown as { ad: unknown }).ad = 'not-an-object';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-object creative without throwing an unhandled error', () => {
    const draft = validDraft();
    (draft.adSets[0].ad as unknown as { creative: unknown }).creative = 'not-an-object';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a blank primary text', () => {
    const draft = validDraft();
    draft.adSets[0].ad.creative.primaryText = '';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a primary text over 600 characters', () => {
    const draft = validDraft();
    draft.adSets[0].ad.creative.primaryText = 'x'.repeat(601);
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a headline over 40 characters', () => {
    const draft = validDraft();
    draft.adSets[0].ad.creative.headline = 'x'.repeat(41);
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a description over 30 characters when present', () => {
    const draft = validDraft();
    draft.adSets[0].ad.creative.description = 'x'.repeat(31);
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a description that is not a string when present', () => {
    const draft = validDraft();
    (draft.adSets[0].ad.creative as unknown as { description: unknown }).description = 123;
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-http(s) link URL', () => {
    const draft = validDraft();
    draft.adSets[0].ad.creative.linkUrl = 'not-a-url';
    expect(() => validateMetaCampaignDraft(draft)).toThrow(InvalidCampaignDraftError);
  });

  it('rejects a non-object draft without throwing an unhandled error', () => {
    expect(() => validateMetaCampaignDraft(null as unknown as MetaCampaignDraft)).toThrow(InvalidCampaignDraftError);
    expect(() => validateMetaCampaignDraft('not-an-object' as unknown as MetaCampaignDraft)).toThrow(InvalidCampaignDraftError);
  });

  it('collects every violation at once rather than failing on the first', () => {
    const draft = validDraft({ campaignName: '', dailyBudgetUsd: -1 });
    try {
      validateMetaCampaignDraft(draft);
      expect.fail('expected validateMetaCampaignDraft to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCampaignDraftError);
      const reasons = (error as InvalidCampaignDraftError).reasons;
      expect(reasons.length).toBeGreaterThanOrEqual(2);
    }
  });
});
