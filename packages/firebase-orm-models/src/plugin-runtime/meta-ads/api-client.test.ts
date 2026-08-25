import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaAdsApiError, MetaAdsHttpApiClient, type MetaAdsApiClientOptions } from './api-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as unknown as Response;
}

const OPTIONS: MetaAdsApiClientOptions = { accessToken: 'access-token-1' };

describe('MetaAdsHttpApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a paused campaign with a daily budget in cents', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: '123' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).createCampaign('999', {
      name: 'Summer Sale',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudgetCents: 2500,
    });

    expect(result).toEqual({ campaignId: '123' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_999/campaigns');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('name')).toBe('Summer Sale');
    expect(body.get('objective')).toBe('OUTCOME_TRAFFIC');
    expect(body.get('status')).toBe('PAUSED');
    expect(body.get('daily_budget')).toBe('2500');
    expect(body.get('access_token')).toBe('access-token-1');
  });

  it('creates a paused ad set with a JSON-encoded targeting spec', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'adset-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).createAdSet('999', {
      campaignId: 'campaign-1',
      name: 'Ad Set 1',
      targeting: { countries: ['US', 'CA'], ageMin: 18, ageMax: 45, genders: ['female'] },
    });

    expect(result).toEqual({ adSetId: 'adset-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_999/adsets');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('campaign_id')).toBe('campaign-1');
    expect(body.get('status')).toBe('PAUSED');
    expect(JSON.parse(body.get('targeting') as string)).toEqual({
      geo_locations: { countries: ['US', 'CA'] },
      age_min: 18,
      age_max: 45,
      genders: [2],
    });
  });

  it('creates an ad set with no genders field when genders is omitted (all genders)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'adset-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).createAdSet('999', {
      campaignId: 'campaign-1',
      name: 'Ad Set 1',
      targeting: { countries: ['US'], ageMin: 18, ageMax: 45 },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(JSON.parse(body.get('targeting') as string)).toEqual({ geo_locations: { countries: ['US'] }, age_min: 18, age_max: 45 });
  });

  it('creates a link-ad creative with page id, message, link, name, and description', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'creative-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).createAdCreative('999', {
      pageId: 'page-1',
      primaryText: 'Big savings today.',
      headline: 'Blue Widgets Sale',
      description: 'Shop now',
      linkUrl: 'https://example.com/widgets',
    });

    expect(result).toEqual({ creativeId: 'creative-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_999/adcreatives');
    const body = new URLSearchParams(String(init.body));
    expect(JSON.parse(body.get('object_story_spec') as string)).toEqual({
      page_id: 'page-1',
      link_data: { message: 'Big savings today.', link: 'https://example.com/widgets', name: 'Blue Widgets Sale', description: 'Shop now' },
    });
  });

  it('omits description from the object_story_spec when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'creative-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).createAdCreative('999', {
      pageId: 'page-1',
      primaryText: 'Big savings today.',
      headline: 'Blue Widgets Sale',
      linkUrl: 'https://example.com/widgets',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    const spec = JSON.parse(body.get('object_story_spec') as string);
    expect('description' in spec.link_data).toBe(false);
  });

  it('creates a paused ad referencing the creative', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'ad-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).createAd('999', { adSetId: 'adset-1', creativeId: 'creative-1', name: 'Ad 1' });

    expect(result).toEqual({ adId: 'ad-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_999/ads');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('status')).toBe('PAUSED');
    expect(JSON.parse(body.get('creative') as string)).toEqual({ creative_id: 'creative-1' });
  });

  it('fetches an ad by id via a GET request, including its live creative id (KAN-73 follow-up)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'ad-1', creative: { id: 'creative-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).getAd('ad-1');

    expect(result).toEqual({ adId: 'ad-1', creativeId: 'creative-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    const parsedUrl = new URL(url);
    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe('https://graph.facebook.com/v21.0/ad-1');
    expect(parsedUrl.searchParams.get('fields')).toBe('id,creative');
  });

  it('throws MetaAdsApiError with the response status when the ad lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, false, 404)));

    await expect(new MetaAdsHttpApiClient(OPTIONS).getAd('missing-ad')).rejects.toMatchObject({ status: 404 });
  });

  it('repoints an ad at a different creative via a single POST', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).updateAd('ad-1', { creativeId: 'creative-2' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/ad-1');
    const body = new URLSearchParams(String(init.body));
    expect(JSON.parse(body.get('creative') as string)).toEqual({ creative_id: 'creative-2' });
  });

  it('throws MetaAdsApiError with the response status when updateAd fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 400)));

    await expect(new MetaAdsHttpApiClient(OPTIONS).updateAd('ad-1', { creativeId: 'creative-2' })).rejects.toBeInstanceOf(MetaAdsApiError);
  });

  it('sets a campaign daily budget in cents', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).setDailyBudgetCents('campaign-1', 5000);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/campaign-1');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('daily_budget')).toBe('5000');
  });

  it('sets an object status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).setObjectStatus('campaign-1', 'ACTIVE');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/campaign-1');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('status')).toBe('ACTIVE');
  });

  it('throws MetaAdsApiError with the response status on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 400)));

    await expect(new MetaAdsHttpApiClient(OPTIONS).setObjectStatus('campaign-1', 'PAUSED')).rejects.toMatchObject({ status: 400 });
    await expect(new MetaAdsHttpApiClient(OPTIONS).setObjectStatus('campaign-1', 'PAUSED')).rejects.toBeInstanceOf(MetaAdsApiError);
  });

  it('fetches a campaign by id via a GET request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'campaign-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).getCampaign('campaign-1');

    expect(result).toEqual({ campaignId: 'campaign-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    const parsedUrl = new URL(url);
    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe('https://graph.facebook.com/v21.0/campaign-1');
    expect(parsedUrl.searchParams.get('fields')).toBe('id');
    expect(parsedUrl.searchParams.get('access_token')).toBe('access-token-1');
  });

  it('throws MetaAdsApiError with the response status when the campaign lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, false, 404)));

    await expect(new MetaAdsHttpApiClient(OPTIONS).getCampaign('missing-campaign')).rejects.toMatchObject({ status: 404 });
  });

  it('fetches an ad set by id via a GET request, including its daily budget and status (KAN-73 follow-up)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'adset-1', daily_budget: '2500', status: 'ACTIVE' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).getAdSet('adset-1');

    expect(result).toEqual({ adSetId: 'adset-1', dailyBudgetCents: 2500, status: 'ACTIVE' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    const parsedUrl = new URL(url);
    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe('https://graph.facebook.com/v21.0/adset-1');
    expect(parsedUrl.searchParams.get('fields')).toBe('id,daily_budget,status');
  });

  it('omits dailyBudgetCents from getAdSet when the ad set has no daily_budget field', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'adset-1', status: 'PAUSED' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).getAdSet('adset-1');

    expect(result).toEqual({ adSetId: 'adset-1', status: 'PAUSED' });
    expect('dailyBudgetCents' in result).toBe(false);
  });

  it('throws MetaAdsApiError with the response status when the ad set lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, false, 404)));

    await expect(new MetaAdsHttpApiClient(OPTIONS).getAdSet('missing-adset')).rejects.toMatchObject({ status: 404 });
  });

  it('updates an ad set with both daily budget and status in a single POST', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).updateAdSet('adset-1', { dailyBudgetCents: 4000, status: 'PAUSED' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/adset-1');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('daily_budget')).toBe('4000');
    expect(body.get('status')).toBe('PAUSED');
  });

  it('updates an ad set with only budget, omitting status from the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).updateAdSet('adset-1', { dailyBudgetCents: 4000 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get('daily_budget')).toBe('4000');
    expect(body.has('status')).toBe(false);
  });

  it('updates an ad set with only status, omitting daily_budget from the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await new MetaAdsHttpApiClient(OPTIONS).updateAdSet('adset-1', { status: 'ACTIVE' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get('status')).toBe('ACTIVE');
    expect(body.has('daily_budget')).toBe(false);
  });

  it('throws MetaAdsApiError with the response status when updateAdSet fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 400)));

    await expect(new MetaAdsHttpApiClient(OPTIONS).updateAdSet('adset-1', { status: 'PAUSED' })).rejects.toBeInstanceOf(MetaAdsApiError);
  });

  it('creates a CUSTOM, user-provided-data Custom Audience', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'audience-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).createCustomAudience('999', { name: 'Warm leads' });

    expect(result).toEqual({ audienceId: 'audience-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_999/customaudiences');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('name')).toBe('Warm leads');
    expect(body.get('subtype')).toBe('CUSTOM');
    expect(body.get('customer_file_source')).toBe('USER_PROVIDED_ONLY');
  });

  it('adds already-hashed email-only contacts to a Custom Audience as an EMAIL-schema payload', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ num_received: 2, num_invalid_entries: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).addContactsToCustomAudience('audience-1', [{ emailHash: 'hash-a' }, { emailHash: 'hash-b' }]);

    expect(result).toEqual({ numReceived: 2 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/audience-1/users');
    const body = new URLSearchParams(String(init.body));
    expect(JSON.parse(body.get('payload') as string)).toEqual({ schema: ['EMAIL'], data: [['hash-a'], ['hash-b']] });
  });

  it('adds mixed email/phone contacts to a Custom Audience as an EMAIL+PHONE-schema payload, filling a missing key with an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ num_received: 2, num_invalid_entries: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).addContactsToCustomAudience('audience-1', [
      { emailHash: 'hash-email-a', phoneHash: 'hash-phone-a' },
      { phoneHash: 'hash-phone-b' },
    ]);

    expect(result).toEqual({ numReceived: 2 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(JSON.parse(body.get('payload') as string)).toEqual({
      schema: ['EMAIL', 'PHONE'],
      data: [
        ['hash-email-a', 'hash-phone-a'],
        ['', 'hash-phone-b'],
      ],
    });
  });

  it('falls back to the contact count when the response omits num_received', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new MetaAdsHttpApiClient(OPTIONS).addContactsToCustomAudience('audience-1', [{ emailHash: 'hash-a' }]);

    expect(result).toEqual({ numReceived: 1 });
  });
});
