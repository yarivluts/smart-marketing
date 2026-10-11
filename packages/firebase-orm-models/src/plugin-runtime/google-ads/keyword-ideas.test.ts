import { describe, expect, it, vi } from 'vitest';
import type { GoogleAdsCredentialSecret } from './credential-secret';
import { buildKeywordIdeasRequestBody, generateGoogleAdsKeywordIdeas, GoogleAdsKeywordIdeasError } from './keyword-ideas';

const CREDENTIAL: GoogleAdsCredentialSecret = {
  developerToken: 'dev-token',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  customerId: '123-456-7890',
  loginCustomerId: '999-000-1111',
};

const REQUEST = {
  keywords: ['e-signature for lawyers', 'sign contracts online'],
  url: 'https://example.com/lawyers',
  language: 'languageConstants/1027',
  geoTargetConstants: ['geoTargetConstants/2376'],
  pageSize: 25,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A v25 response in the documented shape: int64 metrics as strings, competition as the enum name. */
const V25_RESPONSE = {
  results: [
    {
      text: 'electronic signature',
      keywordIdeaMetrics: { avgMonthlySearches: '12100', competition: 'HIGH', competitionIndex: '87', lowTopOfPageBidMicros: '2100000', highTopOfPageBidMicros: '9400000' },
    },
    { text: 'sign pdf', keywordIdeaMetrics: { avgMonthlySearches: '880', competition: 'UNSPECIFIED' } },
    { text: 'brand new term', keywordIdeaMetrics: {} },
    { text: '   ' },
  ],
  totalSize: '4',
};

describe('buildKeywordIdeasRequestBody', () => {
  it('uses keywordAndUrlSeed with both, keywordSeed with keywords only, urlSeed with a URL only', () => {
    expect(buildKeywordIdeasRequestBody(REQUEST)).toEqual({
      language: 'languageConstants/1027',
      geoTargetConstants: ['geoTargetConstants/2376'],
      includeAdultKeywords: false,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      pageSize: 25,
      keywordAndUrlSeed: { url: 'https://example.com/lawyers', keywords: ['e-signature for lawyers', 'sign contracts online'] },
    });
    expect(buildKeywordIdeasRequestBody({ ...REQUEST, url: null })).toMatchObject({ keywordSeed: { keywords: REQUEST.keywords } });
    const urlOnly = buildKeywordIdeasRequestBody({ ...REQUEST, keywords: [], language: null, geoTargetConstants: [] });
    expect(urlOnly).toMatchObject({ urlSeed: { url: 'https://example.com/lawyers' }, geoTargetConstants: [] });
    expect(urlOnly).not.toHaveProperty('language');
  });

  it('keeps at most 20 seed keywords', () => {
    const many = Array.from({ length: 30 }, (_, index) => `kw ${index}`);
    expect((buildKeywordIdeasRequestBody({ ...REQUEST, url: null, keywords: many }).keywordSeed as { keywords: string[] }).keywords).toHaveLength(20);
  });
});

describe('generateGoogleAdsKeywordIdeas', () => {
  it('refreshes a token, calls v25 generateKeywordIdeas for the customer, and parses the int64 metrics', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ access_token: 'access-1', expires_in: 3600 })).mockResolvedValueOnce(json(V25_RESPONSE));
    const ideas = await generateGoogleAdsKeywordIdeas(CREDENTIAL, REQUEST, fetchMock);

    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordIdeas');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer access-1', 'developer-token': 'dev-token', 'login-customer-id': '9990001111' });
    expect(JSON.parse(init.body as string)).toMatchObject({ keywordAndUrlSeed: { url: REQUEST.url } });

    expect(ideas).toEqual([
      { text: 'electronic signature', avgMonthlySearches: 12100, competition: 'HIGH', lowTopOfPageBidMicros: 2100000, highTopOfPageBidMicros: 9400000 },
      { text: 'sign pdf', avgMonthlySearches: 880, competition: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null },
      { text: 'brand new term', avgMonthlySearches: null, competition: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null },
    ]);
  });

  it('a refused OAuth refresh is auth_failed and never calls the API', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    const error = await generateGoogleAdsKeywordIdeas(CREDENTIAL, REQUEST, fetchMock).catch((caught) => caught);
    expect(error).toBeInstanceOf(GoogleAdsKeywordIdeasError);
    expect(error).toMatchObject({ failure: 'auth_failed', status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(error.message)).not.toMatch(/refresh-token|client-secret/);
  });

  it('an unapproved developer token and any other rejection come back as their own codes', async () => {
    const tokenOk = () => json({ access_token: 'access-1', expires_in: 3600 });
    const unapproved = { error: { code: 403, status: 'PERMISSION_DENIED', details: [{ errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' } }] }] } };
    const denied = await generateGoogleAdsKeywordIdeas(CREDENTIAL, REQUEST, vi.fn().mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(json(unapproved, 403))).catch((caught) => caught);
    expect(denied).toMatchObject({ failure: 'developer_token_not_approved', status: 403 });

    const broken = await generateGoogleAdsKeywordIdeas(CREDENTIAL, REQUEST, vi.fn().mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(json({ error: { status: 'INTERNAL' } }, 500))).catch((caught) => caught);
    expect(broken).toMatchObject({ failure: 'api_error', status: 500 });

    const offline = await generateGoogleAdsKeywordIdeas(CREDENTIAL, REQUEST, vi.fn().mockResolvedValueOnce(tokenOk()).mockRejectedValueOnce(new TypeError('fetch failed'))).catch((caught) => caught);
    expect(offline).toMatchObject({ failure: 'api_error', status: 0 });
  });

  it('refuses a lookup with no seed at all', async () => {
    const fetchMock = vi.fn();
    await expect(generateGoogleAdsKeywordIdeas(CREDENTIAL, { ...REQUEST, keywords: [], url: null }, fetchMock)).rejects.toBeInstanceOf(GoogleAdsKeywordIdeasError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
