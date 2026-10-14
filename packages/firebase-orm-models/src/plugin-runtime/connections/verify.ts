import { GOOGLE_ADS_API_VERSION, requestGoogleAdsAccessToken } from '../google-ads/api-client';
import { parseGoogleAdsCredentialSecret } from '../google-ads/credential-secret';
import { META_API_VERSION } from '../meta-ads/api-client';
import { parseMetaAdsCredentialSecret } from '../meta-ads/credential-secret';
import { parseTikTokAdsCredentialSecret } from '../tiktok-ads/credential-secret';

/**
 * Checking that an ad platform connection really works, before anything relies on it: one cheap,
 * read-only call per platform with the saved details - Google Ads reads the customer's name, Meta
 * reads the ad account (and the Page ads post as), TikTok reads the advertiser. The answer is a
 * stable reason code the page explains in plain words; a token never appears in it.
 */

export const AD_PLATFORM_PROVIDERS = ['google_ads', 'meta_ads', 'tiktok_ads'] as const;
export type AdPlatformProvider = (typeof AD_PLATFORM_PROVIDERS)[number];

export function isAdPlatformProvider(value: unknown): value is AdPlatformProvider {
  return typeof value === 'string' && (AD_PLATFORM_PROVIDERS as readonly string[]).includes(value);
}

export type ConnectionFailure =
  | 'invalid_details'
  | 'auth_failed'
  | 'developer_token_not_approved'
  | 'account_not_found'
  | 'permission_denied'
  | 'account_disabled'
  | 'page_not_accessible'
  | 'rate_limited'
  | 'api_error';

export interface ConnectionAccount {
  id: string;
  name: string | null;
  currency: string | null;
}

export type ConnectionCheck = { status: 'ok'; account: ConnectionAccount } | { status: 'failed'; reason: ConnectionFailure; account?: ConnectionAccount };

/** The fields each platform's form asks for; the optional ones may be left empty. */
export const AD_PLATFORM_FIELDS: Record<AdPlatformProvider, { required: readonly string[]; optional: readonly string[] }> = {
  google_ads: { required: ['developerToken', 'clientId', 'clientSecret', 'refreshToken', 'customerId'], optional: ['loginCustomerId'] },
  meta_ads: { required: ['accessToken', 'adAccountId', 'pageId'], optional: [] },
  tiktok_ads: { required: ['accessToken', 'advertiserId'], optional: [] },
};

const digits = (value: string) => value.replace(/[\s-]/g, '');

/**
 * Turns what a person typed into the platform's secret JSON: trimmed, account ids as Google and
 * Meta store them (no dashes, no `act_`), and checked against the platform's own parser. Returns
 * the fields still missing or malformed instead of throwing, so the form can point at them.
 */
export function buildAdPlatformSecret(provider: AdPlatformProvider, input: Record<string, unknown>): { secret: string; accountId: string } | { invalid: string[] } {
  const spec = AD_PLATFORM_FIELDS[provider];
  const value = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '');
  const fields: Record<string, string> = {};
  for (const key of [...spec.required, ...spec.optional]) fields[key] = value(key);
  if (provider === 'google_ads') {
    fields.customerId = digits(fields.customerId!);
    fields.loginCustomerId = digits(fields.loginCustomerId!);
  }
  if (provider === 'meta_ads') fields.adAccountId = fields.adAccountId!.replace(/^act_/i, '').trim();
  if (provider === 'tiktok_ads') fields.advertiserId = digits(fields.advertiserId!);
  const invalid = spec.required.filter((key) => !fields[key]);
  const idField = provider === 'google_ads' ? 'customerId' : provider === 'meta_ads' ? 'adAccountId' : 'advertiserId';
  if (fields[idField] && !/^\d+$/.test(fields[idField]!)) invalid.push(idField);
  if (provider === 'google_ads' && fields.loginCustomerId && !/^\d+$/.test(fields.loginCustomerId)) invalid.push('loginCustomerId');
  if (provider === 'meta_ads' && fields.pageId && !/^\d+$/.test(fields.pageId)) invalid.push('pageId');
  if (invalid.length) return { invalid: [...new Set(invalid)] };
  const payload = Object.fromEntries(Object.entries(fields).filter(([, text]) => text !== ''));
  const secret = JSON.stringify(payload);
  parseAdPlatformSecret(provider, secret);
  return { secret, accountId: fields[idField]! };
}

/** Parses a saved secret with the platform's own parser; throws on a malformed one. */
export function parseAdPlatformSecret(provider: AdPlatformProvider, raw: string): void {
  if (provider === 'google_ads') parseGoogleAdsCredentialSecret(raw);
  else if (provider === 'meta_ads') parseMetaAdsCredentialSecret(raw);
  else parseTikTokAdsCredentialSecret(raw);
}

const TIMEOUT_MS = 20_000;

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<{ status: number; body: string } | null> {
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: response.status, body: (await response.text().catch(() => '')).slice(0, 4000) };
  } catch {
    return null;
  }
}

function json(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Google Ads: refresh the OAuth token, then read the customer's name and currency. */
export async function verifyGoogleAdsConnection(raw: string, fetchImpl: typeof fetch = fetch): Promise<ConnectionCheck> {
  let secret;
  try {
    secret = parseGoogleAdsCredentialSecret(raw);
  } catch {
    return { status: 'failed', reason: 'invalid_details' };
  }
  let accessToken: string;
  try {
    accessToken = (await requestGoogleAdsAccessToken(secret, fetchImpl)).accessToken;
  } catch {
    return { status: 'failed', reason: 'auth_failed' };
  }
  const customerId = secret.customerId.replace(/-/g, '');
  const result = await call(fetchImpl, `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': secret.developerToken,
      'Content-Type': 'application/json',
      ...(secret.loginCustomerId ? { 'login-customer-id': secret.loginCustomerId.replace(/-/g, '') } : {}),
    },
    body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status FROM customer LIMIT 1' }),
  });
  if (!result) return { status: 'failed', reason: 'api_error' };
  if (result.status !== 200) {
    const detail = result.body;
    if (/DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_PROHIBITED|DEVELOPER_TOKEN_INVALID|developer token/i.test(detail)) return { status: 'failed', reason: 'developer_token_not_approved' };
    if (/CUSTOMER_NOT_ENABLED/.test(detail)) return { status: 'failed', reason: 'account_disabled' };
    if (/USER_PERMISSION_DENIED|CUSTOMER_NOT_FOUND|NOT_ADS_USER|INVALID_CUSTOMER_ID/.test(detail)) return { status: 'failed', reason: 'account_not_found' };
    if (result.status === 401) return { status: 'failed', reason: 'auth_failed' };
    if (result.status === 429 || /RESOURCE_EXHAUSTED/.test(detail)) return { status: 'failed', reason: 'rate_limited' };
    if (result.status === 403) return { status: 'failed', reason: 'permission_denied' };
    return { status: 'failed', reason: 'api_error' };
  }
  const customer = ((json(result.body)?.results as { customer?: Record<string, unknown> }[] | undefined)?.[0]?.customer ?? {}) as Record<string, unknown>;
  const account: ConnectionAccount = {
    id: customerId,
    name: typeof customer.descriptiveName === 'string' ? customer.descriptiveName : null,
    currency: typeof customer.currencyCode === 'string' ? customer.currencyCode : null,
  };
  if (typeof customer.status === 'string' && customer.status !== 'ENABLED') return { status: 'failed', reason: 'account_disabled', account };
  return { status: 'ok', account };
}

function metaFailure(status: number, body: string): ConnectionFailure {
  const code = Number(/"code"\s*:\s*(\d+)/.exec(body)?.[1] ?? NaN);
  if (code === 190 || status === 401) return 'auth_failed';
  if (code === 100 && /does not exist|Unsupported get request/i.test(body)) return 'account_not_found';
  if (code === 10 || (code >= 200 && code < 300) || status === 403) return 'permission_denied';
  if ([4, 17, 32, 613].includes(code) || status === 429) return 'rate_limited';
  return 'api_error';
}

/** Meta: read the ad account (name, currency, status), then the Page every ad posts as. */
export async function verifyMetaAdsConnection(raw: string, fetchImpl: typeof fetch = fetch): Promise<ConnectionCheck> {
  let secret;
  try {
    secret = parseMetaAdsCredentialSecret(raw);
  } catch {
    return { status: 'failed', reason: 'invalid_details' };
  }
  const base = `https://graph.facebook.com/${META_API_VERSION}`;
  const id = secret.adAccountId.replace(/^act_/, '');
  const accountQuery = new URLSearchParams({ fields: 'name,account_status,currency', access_token: secret.accessToken });
  const result = await call(fetchImpl, `${base}/act_${id}?${accountQuery.toString()}`, { method: 'GET' });
  if (!result) return { status: 'failed', reason: 'api_error' };
  if (result.status !== 200) return { status: 'failed', reason: metaFailure(result.status, result.body) };
  const body = json(result.body) ?? {};
  const account: ConnectionAccount = { id, name: typeof body.name === 'string' ? body.name : null, currency: typeof body.currency === 'string' ? body.currency : null };
  // 1 = active, 9 = in a grace period (still serving); anything else cannot run ads.
  if (![1, 9].includes(Number(body.account_status))) return { status: 'failed', reason: 'account_disabled', account };
  const pageQuery = new URLSearchParams({ fields: 'name', access_token: secret.accessToken });
  const page = await call(fetchImpl, `${base}/${secret.pageId}?${pageQuery.toString()}`, { method: 'GET' });
  if (!page) return { status: 'failed', reason: 'api_error', account };
  if (page.status !== 200) return { status: 'failed', reason: metaFailure(page.status, page.body) === 'auth_failed' ? 'auth_failed' : 'page_not_accessible', account };
  return { status: 'ok', account };
}

/** TikTok: read the advertiser (name, currency, status) with the access token. */
export async function verifyTikTokAdsConnection(raw: string, fetchImpl: typeof fetch = fetch): Promise<ConnectionCheck> {
  let secret;
  try {
    secret = parseTikTokAdsCredentialSecret(raw);
  } catch {
    return { status: 'failed', reason: 'invalid_details' };
  }
  const query = new URLSearchParams({ advertiser_ids: JSON.stringify([secret.advertiserId]), fields: JSON.stringify(['name', 'status', 'currency']) });
  const result = await call(fetchImpl, `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?${query.toString()}`, { method: 'GET', headers: { 'Access-Token': secret.accessToken } });
  if (!result) return { status: 'failed', reason: 'api_error' };
  if (result.status === 429) return { status: 'failed', reason: 'rate_limited' };
  const body = json(result.body);
  if (result.status !== 200 || !body) return { status: 'failed', reason: result.status === 401 ? 'auth_failed' : 'api_error' };
  // TikTok answers 200 with its own code: 0 is success; 40100 too many requests; 40101-40106 a bad
  // or expired token; 40001 no permission for this advertiser.
  const code = Number(body.code);
  if (code === 40100) return { status: 'failed', reason: 'rate_limited' };
  if (code >= 40101 && code <= 40106) return { status: 'failed', reason: 'auth_failed' };
  if (code === 40001) return { status: 'failed', reason: 'permission_denied' };
  if (code !== 0) return { status: 'failed', reason: 'api_error' };
  const row = ((body.data as { list?: Record<string, unknown>[] } | undefined)?.list ?? [])[0];
  if (!row) return { status: 'failed', reason: 'account_not_found' };
  const account: ConnectionAccount = { id: secret.advertiserId, name: typeof row.name === 'string' ? row.name : null, currency: typeof row.currency === 'string' ? row.currency : null };
  if (typeof row.status === 'string' && row.status !== 'STATUS_ENABLE') return { status: 'failed', reason: 'account_disabled', account };
  return { status: 'ok', account };
}

/** Checks a saved secret against its platform. */
export function verifyAdPlatformConnection(provider: AdPlatformProvider, raw: string, fetchImpl: typeof fetch = fetch): Promise<ConnectionCheck> {
  if (provider === 'google_ads') return verifyGoogleAdsConnection(raw, fetchImpl);
  if (provider === 'meta_ads') return verifyMetaAdsConnection(raw, fetchImpl);
  return verifyTikTokAdsConnection(raw, fetchImpl);
}
