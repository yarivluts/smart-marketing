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
});
