import { describe, expect, it, vi } from 'vitest';
import { buildAdPlatformSecret, verifyGoogleAdsConnection, verifyMetaAdsConnection, verifyTikTokAdsConnection } from './verify';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const GOOGLE = JSON.stringify({ developerToken: 'dev', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', customerId: '4816235600', loginCustomerId: '1112223333' });
const META = JSON.stringify({ accessToken: 'tok', adAccountId: '1646897415410557', pageId: '1253606311170957' });
const TIKTOK = JSON.stringify({ accessToken: 'tt', advertiserId: '7000000000000' });

function google(search: () => Response, token: () => Response = () => json({ access_token: 'access', expires_in: 3600 })) {
  return vi.fn(async (input: string | URL) => (String(input) === 'https://oauth2.googleapis.com/token' ? token() : search())) as unknown as typeof fetch;
}

describe('buildAdPlatformSecret', () => {
  it('cleans account ids the way each platform stores them and names what is missing', () => {
    const built = buildAdPlatformSecret('google_ads', { developerToken: ' dev ', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', customerId: '481-623-5600', loginCustomerId: '' });
    expect(built).toEqual({ secret: JSON.stringify({ developerToken: 'dev', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', customerId: '4816235600' }), accountId: '4816235600' });
    expect(buildAdPlatformSecret('meta_ads', { accessToken: 't', adAccountId: 'act_123', pageId: '456' })).toMatchObject({ accountId: '123' });
    expect(buildAdPlatformSecret('meta_ads', { accessToken: '', adAccountId: 'abc', pageId: 'x' })).toEqual({ invalid: ['accessToken', 'adAccountId', 'pageId'] });
    expect(buildAdPlatformSecret('tiktok_ads', { accessToken: 'tt', advertiserId: '70 00' })).toMatchObject({ accountId: '7000' });
    expect(buildAdPlatformSecret('google_ads', { developerToken: 'd', clientId: 'c', clientSecret: 's', refreshToken: 'r', customerId: '1', loginCustomerId: 'mcc' })).toEqual({ invalid: ['loginCustomerId'] });
  });
});

describe('verifyGoogleAdsConnection', () => {
  it('reads the customer through the manager account and reports its name and currency', async () => {
    const fetchImpl = google(() => json({ results: [{ customer: { id: '4816235600', descriptiveName: 'EasySign Google Ads', currencyCode: 'ILS', status: 'ENABLED' } }] }));
    expect(await verifyGoogleAdsConnection(GOOGLE, fetchImpl)).toEqual({ status: 'ok', account: { id: '4816235600', name: 'EasySign Google Ads', currency: 'ILS' } });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/customers\/4816235600\/googleAds:search$/);
    expect(init.headers).toMatchObject({ 'developer-token': 'dev', 'login-customer-id': '1112223333', Authorization: 'Bearer access' });
  });

  it('names the reason: refused refresh token, unapproved developer token, unreachable or disabled account, malformed details', async () => {
    expect(await verifyGoogleAdsConnection(GOOGLE, google(() => json({}), () => json({ error: 'invalid_grant' }, 400)))).toEqual({ status: 'failed', reason: 'auth_failed' });
    expect(await verifyGoogleAdsConnection(GOOGLE, google(() => json({ error: { details: [{ errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' } }] }] } }, 403)))).toEqual({ status: 'failed', reason: 'developer_token_not_approved' });
    expect(await verifyGoogleAdsConnection(GOOGLE, google(() => json({ error: { message: 'USER_PERMISSION_DENIED' } }, 403)))).toEqual({ status: 'failed', reason: 'account_not_found' });
    expect(await verifyGoogleAdsConnection(GOOGLE, google(() => json({ results: [{ customer: { descriptiveName: 'Old', status: 'CANCELED' } }] })))).toMatchObject({ status: 'failed', reason: 'account_disabled' });
    expect(await verifyGoogleAdsConnection('{"developerToken":"x"}', google(() => json({})))).toEqual({ status: 'failed', reason: 'invalid_details' });
  });
});

describe('verifyMetaAdsConnection', () => {
  function meta(account: () => Response, page: () => Response = () => json({ name: 'EasySign', id: '1253606311170957' })) {
    return vi.fn(async (input: string | URL) => (new URL(String(input)).pathname.includes('/act_') ? account() : page())) as unknown as typeof fetch;
  }

  it('reads the ad account and the Page ads post as', async () => {
    const fetchImpl = meta(() => json({ name: 'Yariv Luts', account_status: 1, currency: 'ILS' }));
    expect(await verifyMetaAdsConnection(META, fetchImpl)).toEqual({ status: 'ok', account: { id: '1646897415410557', name: 'Yariv Luts', currency: 'ILS' } });
    const first = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]));
    expect(first.pathname).toMatch(/\/act_1646897415410557$/);
    expect(first.searchParams.get('fields')).toBe('name,account_status,currency');
  });

  it('tells an expired token, a disabled account and an unreachable Page apart', async () => {
    expect(await verifyMetaAdsConnection(META, meta(() => json({ error: { code: 190, message: 'expired' } }, 400)))).toEqual({ status: 'failed', reason: 'auth_failed' });
    expect(await verifyMetaAdsConnection(META, meta(() => json({ name: 'X', account_status: 2, currency: 'USD' })))).toMatchObject({ status: 'failed', reason: 'account_disabled', account: { name: 'X' } });
    expect(await verifyMetaAdsConnection(META, meta(() => json({ name: 'X', account_status: 1 }), () => json({ error: { code: 100, message: 'Unsupported get request' } }, 400)))).toMatchObject({ status: 'failed', reason: 'page_not_accessible' });
    expect(await verifyMetaAdsConnection(META, meta(() => json({ error: { code: 100, message: 'Object with ID does not exist' } }, 400)))).toEqual({ status: 'failed', reason: 'account_not_found' });
  });
});

describe('verifyTikTokAdsConnection', () => {
  it('reads the advertiser with the access token header', async () => {
    const fetchImpl = vi.fn(async () => json({ code: 0, message: 'OK', data: { list: [{ advertiser_id: '7000000000000', name: 'EasySign TT', status: 'STATUS_ENABLE', currency: 'USD' }] } })) as unknown as typeof fetch;
    expect(await verifyTikTokAdsConnection(TIKTOK, fetchImpl)).toEqual({ status: 'ok', account: { id: '7000000000000', name: 'EasySign TT', currency: 'USD' } });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(new URL(url).searchParams.get('advertiser_ids')).toBe('["7000000000000"]');
    expect(init.headers).toEqual({ 'Access-Token': 'tt' });
  });

  it('maps TikTok codes: bad token, no permission, too many requests, unknown or disabled advertiser', async () => {
    const answer = (body: unknown) => vi.fn(async () => json(body)) as unknown as typeof fetch;
    expect(await verifyTikTokAdsConnection(TIKTOK, answer({ code: 40105, message: 'Access token is incorrect' }))).toEqual({ status: 'failed', reason: 'auth_failed' });
    expect(await verifyTikTokAdsConnection(TIKTOK, answer({ code: 40001, message: 'No permission' }))).toEqual({ status: 'failed', reason: 'permission_denied' });
    expect(await verifyTikTokAdsConnection(TIKTOK, answer({ code: 40100, message: 'Too many' }))).toEqual({ status: 'failed', reason: 'rate_limited' });
    expect(await verifyTikTokAdsConnection(TIKTOK, answer({ code: 0, data: { list: [] } }))).toEqual({ status: 'failed', reason: 'account_not_found' });
    expect(await verifyTikTokAdsConnection(TIKTOK, answer({ code: 0, data: { list: [{ name: 'X', status: 'STATUS_DISABLE' }] } }))).toMatchObject({ status: 'failed', reason: 'account_disabled' });
    expect(await verifyTikTokAdsConnection('{"accessToken":"x","advertiserId":"abc"}', answer({}))).toEqual({ status: 'failed', reason: 'invalid_details' });
  });
});
