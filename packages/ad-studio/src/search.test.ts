// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  getAdStudioBrief: vi.fn(),
  resolveAdStudioKeywordCredential: vi.fn(),
  generateGoogleAdsKeywordIdeas: vi.fn(),
  assertAdStudioQuota: vi.fn(),
  recordAdStudioUsage: vi.fn(),
}));

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));
vi.mock('./planning-sources', async (importOriginal) => ({ ...(await importOriginal<object>()), serverKms: () => ({ kind: 'test-kms' }) }));
vi.mock('./brand', () => ({
  briefPromptInput: vi.fn(async (brief: { name: string; language: string }) => ({ name: brief.name, objective: 'Signups', productDescription: 'E-signatures', landingPageUrl: 'https://easysign.example', format: 'vertical', language: brief.language, targetSeconds: 30 })),
}));

import { AdStudioProviderError, type AdStudioLlm } from './llm';
import { suggestAdStudioKeywords } from './search';

function llm(result: unknown): AdStudioLlm & { generateJson: ReturnType<typeof vi.fn> } {
  return { provider: 'gemini', model: 'gemini-test', generateJson: vi.fn(async () => result) } as never;
}

const TARGETING = { country: 'IL', language: 'he' };
const ctx = (model: AdStudioLlm) => ({ organizationId: 'o', projectId: 'p', actorId: 'u', llm: model, briefId: 'b1', targeting: TARGETING, seeds: ['e-signature'] });

beforeEach(() => {
  vi.clearAllMocks();
  orm.getAdStudioBrief.mockResolvedValue({ id: 'b1', name: 'Sign fast', language: 'he', landing_page_url: 'https://easysign.example', plan: null, plan_sources: null });
});

describe('suggestAdStudioKeywords', () => {
  it('chooses from Google ideas with their volumes, metered as keyword_choice, and saves nothing', async () => {
    orm.resolveAdStudioKeywordCredential.mockResolvedValue({ status: 'ok', credential: { kind: 'google' } });
    orm.generateGoogleAdsKeywordIdeas.mockResolvedValue([
      { text: 'digital signature', avgMonthlySearches: 2400, competition: 'MEDIUM', lowTopOfPageBidMicros: 1_200_000, highTopOfPageBidMicros: 4_500_000 },
      { text: 'docusign jobs', avgMonthlySearches: 50, competition: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null },
    ]);
    const model = llm({ keywords: [{ text: 'digital signature', matchType: 'EXACT' }, { text: 'invented', matchType: 'PHRASE' }], negatives: ['jobs'] });
    const result = await suggestAdStudioKeywords(ctx(model));
    expect(result).toEqual({
      researched: true,
      reason: null,
      keywords: { targeting: TARGETING, negatives: ['jobs'], keywords: [{ text: 'digital signature', matchType: 'EXACT', avgMonthlySearches: 2400, competition: 'MEDIUM', lowTopOfPageBid: 1.2, highTopOfPageBid: 4.5 }] },
    });
    // The lookup starts from the person's seeds, the ad name and the landing page.
    expect(orm.generateGoogleAdsKeywordIdeas.mock.calls[0]![1]).toMatchObject({ keywords: ['e-signature', 'sign fast'], url: 'https://easysign.example' });
    expect(model.generateJson.mock.calls[0]![0].user).toContain('digital signature | 2400 | MEDIUM');
    expect(orm.recordAdStudioUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'keyword_choice', outcome: 'succeeded', briefId: 'b1' }));
  });

  it('falls back to its own keywords, without volumes, and says why Google was not used', async () => {
    orm.resolveAdStudioKeywordCredential.mockResolvedValue({ status: 'unavailable', reason: 'no_google_ads_credential' });
    const model = llm({ keywords: [{ text: 'sign documents online', matchType: 'PHRASE' }], negatives: [] });
    const result = await suggestAdStudioKeywords(ctx(model));
    expect(result.researched).toBe(false);
    expect(result.reason).toBe('no_google_ads_credential');
    expect(result.keywords.keywords).toEqual([{ text: 'sign documents online', matchType: 'PHRASE', avgMonthlySearches: null, competition: null, lowTopOfPageBid: null, highTopOfPageBid: null }]);
    expect(orm.generateGoogleAdsKeywordIdeas).not.toHaveBeenCalled();
  });

  it('refuses an answer with no usable keyword', async () => {
    orm.resolveAdStudioKeywordCredential.mockResolvedValue({ status: 'unavailable', reason: 'no_google_ads_credential' });
    await expect(suggestAdStudioKeywords(ctx(llm({ keywords: [{ text: '', matchType: 'PHRASE' }], negatives: [] })))).rejects.toBeInstanceOf(AdStudioProviderError);
  });

  it('makes no model call when the daily limit is used up', async () => {
    orm.resolveAdStudioKeywordCredential.mockResolvedValue({ status: 'unavailable', reason: 'no_google_ads_credential' });
    orm.assertAdStudioQuota.mockRejectedValueOnce(new Error('quota'));
    const model = llm({ keywords: [], negatives: [] });
    await expect(suggestAdStudioKeywords(ctx(model))).rejects.toThrow('quota');
    expect(model.generateJson).not.toHaveBeenCalled();
  });
});
