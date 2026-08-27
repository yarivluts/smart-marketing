import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleAdsCampaignDraft } from '../../automation-runtime';
import { GoogleAdsApiError, GoogleAdsHttpApiClient, type GoogleAdsApiClientOptions } from './api-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as unknown as Response;
}

const OPTIONS: GoogleAdsApiClientOptions = {
  developerToken: 'dev-token',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  loginCustomerId: '111-manager',
};

const TOKEN_RESPONSE = { access_token: 'access-token-1', expires_in: 3600 };

const DRAFT: GoogleAdsCampaignDraft = {
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
};

describe('GoogleAdsHttpApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes an OAuth access token once and reuses it across multiple calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaigns/1' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaigns/1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GoogleAdsHttpApiClient(OPTIONS);
    await client.setCampaignStatus('123', 'customers/123/campaigns/1', 'PAUSED');
    await client.setCampaignStatus('123', 'customers/123/campaigns/1', 'ENABLED');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(tokenInit.method).toBe('POST');
    expect(String(tokenInit.body)).toContain('refresh_token=refresh-token');
    expect(String(tokenInit.body)).toContain('grant_type=refresh_token');
  });

  it('sends developer-token, login-customer-id, and bearer auth headers on every mutate call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaigns/1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).setCampaignStatus('123', 'customers/123/campaigns/1', 'REMOVED');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/campaigns:mutate');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-token-1');
    expect(headers['developer-token']).toBe('dev-token');
    expect(headers['login-customer-id']).toBe('111-manager');
    const body = JSON.parse(String(init.body));
    expect(body.operations).toEqual([{ update: { resourceName: 'customers/123/campaigns/1', status: 'REMOVED' }, updateMask: 'status' }]);
  });

  it('omits the login-customer-id header when the credential has none', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaigns/1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const { loginCustomerId: _loginCustomerId, ...withoutLoginCustomerId } = OPTIONS;
    await new GoogleAdsHttpApiClient(withoutLoginCustomerId).setCampaignStatus('123', 'customers/123/campaigns/1', 'PAUSED');

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect('login-customer-id' in (init.headers as Record<string, string>)).toBe(false);
  });

  it('creates a full campaign draft via budget -> campaign -> ad group -> ad -> keywords, in order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaignBudgets/1' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaigns/1' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/adGroups/1' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/adGroupAds/1' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/adGroupCriteria/1' }, { resourceName: 'customers/123/adGroupCriteria/2' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).createCampaignDraft('123', DRAFT);

    expect(result).toEqual({
      campaignResourceName: 'customers/123/campaigns/1',
      campaignBudgetResourceName: 'customers/123/campaignBudgets/1',
      adGroupResourceNames: ['customers/123/adGroups/1'],
      adResourceNames: ['customers/123/adGroupAds/1'],
    });

    const urls = fetchMock.mock.calls.slice(1).map(([url]: [string]) => url);
    expect(urls).toEqual([
      'https://googleads.googleapis.com/v17/customers/123/campaignBudgets:mutate',
      'https://googleads.googleapis.com/v17/customers/123/campaigns:mutate',
      'https://googleads.googleapis.com/v17/customers/123/adGroups:mutate',
      'https://googleads.googleapis.com/v17/customers/123/adGroupAds:mutate',
      'https://googleads.googleapis.com/v17/customers/123/adGroupCriteria:mutate',
    ]);

    const budgetBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(budgetBody.operations[0].create.amountMicros).toBe('25000000');

    const campaignBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(campaignBody.operations[0].create).toMatchObject({
      name: 'Winning Themes',
      advertisingChannelType: 'SEARCH',
      status: 'PAUSED',
      campaignBudget: 'customers/123/campaignBudgets/1',
    });

    const adBody = JSON.parse(String((fetchMock.mock.calls[4] as [string, RequestInit])[1].body));
    expect(adBody.operations[0].create.status).toBe('PAUSED');
    expect(adBody.operations[0].create.ad.responsiveSearchAd.headlines).toHaveLength(3);
    expect(adBody.operations[0].create.ad.finalUrls).toEqual(['https://example.com/widgets']);

    const criteriaBody = JSON.parse(String((fetchMock.mock.calls[5] as [string, RequestInit])[1].body));
    expect(criteriaBody.operations).toEqual([
      { create: { adGroup: 'customers/123/adGroups/1', status: 'ENABLED', keyword: { text: 'blue widgets', matchType: 'PHRASE' } } },
      { create: { adGroup: 'customers/123/adGroups/1', negative: true, keyword: { text: 'free', matchType: 'BROAD' } } },
    ]);
  });

  it('sets a campaign budget resource amount in micros', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/campaignBudgets/1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).setCampaignBudgetAmount('123', 'customers/123/campaignBudgets/1', 42.5);

    const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(body.operations).toEqual([
      { update: { resourceName: 'customers/123/campaignBudgets/1', amountMicros: '42500000' }, updateMask: 'amountMicros' },
    ]);
  });

  it('throws GoogleAdsApiError when the OAuth token refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, false, 401)));

    await expect(new GoogleAdsHttpApiClient(OPTIONS).setCampaignStatus('123', 'x', 'PAUSED')).rejects.toBeInstanceOf(GoogleAdsApiError);
  });

  it('throws GoogleAdsApiError with the response status on a failed mutate call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleAdsHttpApiClient(OPTIONS).setCampaignStatus('123', 'x', 'PAUSED')).rejects.toMatchObject({ status: 400 });
  });

  it('looks up a campaign budget resource name via a GAQL search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ campaign: { resourceName: 'customers/123/campaigns/1', campaignBudget: 'customers/123/campaignBudgets/1' } }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).lookupCampaignBudgetResourceName('123', 'customers/123/campaigns/1');

    expect(result).toBe('customers/123/campaignBudgets/1');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/googleAds:search');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-token-1');
    expect(headers['developer-token']).toBe('dev-token');
    const body = JSON.parse(String(init.body));
    expect(body.query).toContain("campaign.resource_name = 'customers/123/campaigns/1'");
  });

  it('throws GoogleAdsApiError when the GAQL search returns no matching campaign', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleAdsHttpApiClient(OPTIONS).lookupCampaignBudgetResourceName('123', 'customers/123/campaigns/999'),
    ).rejects.toBeInstanceOf(GoogleAdsApiError);
  });

  it('escapes a single quote in the campaign resource name before splicing it into the GAQL query', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleAdsHttpApiClient(OPTIONS).lookupCampaignBudgetResourceName('123', "malicious' OR '1'='1"),
    ).rejects.toBeInstanceOf(GoogleAdsApiError);

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.query).toContain("campaign.resource_name = 'malicious\\' OR \\'1\\'=\\'1'");
  });

  it('throws GoogleAdsApiError with the response status when the GAQL search request itself fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 403));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleAdsHttpApiClient(OPTIONS).lookupCampaignBudgetResourceName('123', 'customers/123/campaigns/1'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('creates a CRM-based Customer Match user list via a userLists mutate call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/userLists/1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).createCustomerMatchUserList('123', { name: 'Segment: Paying customers' });

    expect(result).toEqual({ userListResourceName: 'customers/123/userLists/1' });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/userLists:mutate');
    const body = JSON.parse(String(init.body));
    expect(body.operations).toEqual([
      { create: { name: 'Segment: Paying customers', membershipStatus: 'OPEN', crmBasedUserListInfo: { uploadKeyType: 'CONTACT_INFO' } } },
    ]);
  });

  it('uploads hashed-email-only contacts to a Customer Match user list via create -> addOperations -> run, in order, against the job\'s own resource name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [
      { hashedEmail: 'hash-a' },
      { hashedEmail: 'hash-b' },
    ]);

    expect(result).toEqual({ numReceived: 2 });
    const urls = fetchMock.mock.calls.slice(1).map(([url]: [string]) => url);
    expect(urls).toEqual([
      'https://googleads.googleapis.com/v17/customers/123/offlineUserDataJobs:create',
      'https://googleads.googleapis.com/v17/customers/123/offlineUserDataJobs/456:addOperations',
      'https://googleads.googleapis.com/v17/customers/123/offlineUserDataJobs/456:run',
    ]);

    const createBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(createBody.job).toEqual({ type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: 'customers/123/userLists/1' } });

    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([
      { create: { userIdentifiers: [{ hashedEmail: 'hash-a' }] } },
      { create: { userIdentifiers: [{ hashedEmail: 'hash-b' }] } },
    ]);

    const runBody = JSON.parse(String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body));
    expect(runBody).toEqual({});
  });

  it('combines a contact\'s hashedEmail and hashedPhoneNumber onto the same userIdentifiers array for better match rate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [
      { hashedEmail: 'hash-email-a', hashedPhoneNumber: 'hash-phone-a' },
      { hashedPhoneNumber: 'hash-phone-b' },
    ]);

    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([
      { create: { userIdentifiers: [{ hashedEmail: 'hash-email-a' }, { hashedPhoneNumber: 'hash-phone-a' }] } },
      { create: { userIdentifiers: [{ hashedPhoneNumber: 'hash-phone-b' }] } },
    ]);
  });

  it('uploads a mobileId-only contact as a raw, unhashed userIdentifiers entry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [
      { mobileId: '38400000-8cf0-11bd-b23e-10b96e4ef00d' },
    ]);

    expect(result).toEqual({ numReceived: 1 });
    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([{ create: { userIdentifiers: [{ mobileId: '38400000-8cf0-11bd-b23e-10b96e4ef00d' }] } }]);
  });

  it('combines hashedEmail, hashedPhoneNumber, and mobileId onto the same userIdentifiers array when a contact carries all three', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [
      { hashedEmail: 'hash-email-a', hashedPhoneNumber: 'hash-phone-a', mobileId: 'maid-a' },
    ]);

    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([{ create: { userIdentifiers: [{ hashedEmail: 'hash-email-a' }, { hashedPhoneNumber: 'hash-phone-a' }, { mobileId: 'maid-a' }] } }]);
  });

  it('uploads a mailing-address-only contact as a single addressInfo userIdentifiers entry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [
      { addressInfo: { hashedFirstName: 'hash-fn', hashedLastName: 'hash-ln', city: 'Mountain View', state: 'CA', countryCode: 'US', postalCode: '94043' } },
    ]);

    expect(result).toEqual({ numReceived: 1 });
    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([
      {
        create: {
          userIdentifiers: [
            { addressInfo: { hashedFirstName: 'hash-fn', hashedLastName: 'hash-ln', city: 'Mountain View', state: 'CA', countryCode: 'US', postalCode: '94043' } },
          ],
        },
      },
    ]);
  });

  it('combines hashedEmail and addressInfo onto the same userIdentifiers array when a contact carries both', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [
      { hashedEmail: 'hash-email-a', addressInfo: { city: 'Mountain View' } },
    ]);

    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([{ create: { userIdentifiers: [{ hashedEmail: 'hash-email-a' }, { addressInfo: { city: 'Mountain View' } }] } }]);
  });

  it('omits the addressInfo entry entirely when a contact has none, keeping the payload byte-identical to before mailing-address support', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ resourceName: 'customers/123/offlineUserDataJobs/456' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [{ hashedEmail: 'hash-a' }]);

    const addOperationsBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body));
    expect(addOperationsBody.operations).toEqual([{ create: { userIdentifiers: [{ hashedEmail: 'hash-a' }] } }]);
  });

  it('throws GoogleAdsApiError with the response status when the offline user data job create call fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleAdsHttpApiClient(OPTIONS).addContactsToCustomerMatchUserList('123', 'customers/123/userLists/1', [{ hashedEmail: 'hash-a' }]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('adds keywords and negative keywords to an existing ad group via one adGroupCriteria mutate call, splitting the results by input order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { resourceName: 'customers/123/adGroupCriteria/1' },
            { resourceName: 'customers/123/adGroupCriteria/2' },
            { resourceName: 'customers/123/adGroupCriteria/3' },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).addAdGroupKeywords(
      '123',
      'customers/123/adGroups/1',
      [
        { text: 'blue widgets', matchType: 'PHRASE' },
        { text: 'cheap widgets', matchType: 'BROAD' },
      ],
      [{ text: 'free', matchType: 'BROAD' }],
    );

    expect(result).toEqual({
      keywordResourceNames: ['customers/123/adGroupCriteria/1', 'customers/123/adGroupCriteria/2'],
      negativeKeywordResourceNames: ['customers/123/adGroupCriteria/3'],
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/adGroupCriteria:mutate');
    const body = JSON.parse(String(init.body));
    expect(body.operations).toEqual([
      { create: { adGroup: 'customers/123/adGroups/1', status: 'ENABLED', keyword: { text: 'blue widgets', matchType: 'PHRASE' } } },
      { create: { adGroup: 'customers/123/adGroups/1', status: 'ENABLED', keyword: { text: 'cheap widgets', matchType: 'BROAD' } } },
      { create: { adGroup: 'customers/123/adGroups/1', negative: true, keyword: { text: 'free', matchType: 'BROAD' } } },
    ]);
  });

  it('throws GoogleAdsApiError with the response status on a failed addAdGroupKeywords call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleAdsHttpApiClient(OPTIONS).addAdGroupKeywords('123', 'customers/123/adGroups/1', [{ text: 'blue widgets', matchType: 'PHRASE' }], []),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('removes ad-group criteria by resource name via a remove mutate operation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/adGroupCriteria/1' }, { resourceName: 'customers/123/adGroupCriteria/2' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).removeAdGroupCriteria('123', ['customers/123/adGroupCriteria/1', 'customers/123/adGroupCriteria/2']);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/adGroupCriteria:mutate');
    const body = JSON.parse(String(init.body));
    expect(body.operations).toEqual([
      { remove: 'customers/123/adGroupCriteria/1' },
      { remove: 'customers/123/adGroupCriteria/2' },
    ]);
  });

  it('throws GoogleAdsApiError with the response status on a failed removeAdGroupCriteria call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleAdsHttpApiClient(OPTIONS).removeAdGroupCriteria('123', ['customers/123/adGroupCriteria/1'])).rejects.toMatchObject({
      status: 400,
    });
  });

  it('creates a Responsive Search Ad in an existing ad group with the given status via one adGroupAds mutate call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/adGroupAds/2' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleAdsHttpApiClient(OPTIONS).createResponsiveSearchAd(
      '123',
      'customers/123/adGroups/1',
      {
        headlines: ['New Headline One', 'New Headline Two', 'New Headline Three'],
        descriptions: ['New description one.', 'New description two.'],
        finalUrl: 'https://example.com/new-widgets',
      },
      'ENABLED',
    );

    expect(result).toEqual({ adResourceName: 'customers/123/adGroupAds/2' });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/adGroupAds:mutate');
    const body = JSON.parse(String(init.body));
    expect(body.operations).toEqual([
      {
        create: {
          adGroup: 'customers/123/adGroups/1',
          status: 'ENABLED',
          ad: {
            responsiveSearchAd: {
              headlines: [{ text: 'New Headline One' }, { text: 'New Headline Two' }, { text: 'New Headline Three' }],
              descriptions: [{ text: 'New description one.' }, { text: 'New description two.' }],
            },
            finalUrls: ['https://example.com/new-widgets'],
          },
        },
      },
    ]);
  });

  it('throws GoogleAdsApiError with the response status on a failed createResponsiveSearchAd call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GoogleAdsHttpApiClient(OPTIONS).createResponsiveSearchAd(
        '123',
        'customers/123/adGroups/1',
        { headlines: ['A', 'B', 'C'], descriptions: ['D', 'E'], finalUrl: 'https://example.com' },
        'ENABLED',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('sets an existing ad\'s own status via an adGroupAds update mutate call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/123/adGroupAds/1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await new GoogleAdsHttpApiClient(OPTIONS).setAdGroupAdStatus('123', 'customers/123/adGroupAds/1', 'PAUSED');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v17/customers/123/adGroupAds:mutate');
    const body = JSON.parse(String(init.body));
    expect(body.operations).toEqual([{ update: { resourceName: 'customers/123/adGroupAds/1', status: 'PAUSED' }, updateMask: 'status' }]);
  });

  it('throws GoogleAdsApiError with the response status on a failed setAdGroupAdStatus call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(TOKEN_RESPONSE)).mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleAdsHttpApiClient(OPTIONS).setAdGroupAdStatus('123', 'customers/123/adGroupAds/1', 'ENABLED')).rejects.toMatchObject({
      status: 400,
    });
  });
});
