import { META_API_VERSION } from './api-client';

/**
 * Read-only Meta Marketing API lookups for planning an audience (Ad Studio): the ad account's own
 * saved, custom and lookalike audiences with Meta's size ranges, interest search with audience
 * sizes, a reach estimate for a targeting spec, and the account's past results broken down by age
 * and gender, placement or country. Plain GETs with the credential's access token; the token is
 * never put in an error message.
 */

const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const TIMEOUT_MS = 20_000;

export type MetaInsightsFailure = 'auth_failed' | 'permission_denied' | 'rate_limited' | 'api_error';

export class MetaInsightsError extends Error {
  constructor(
    public readonly failure: MetaInsightsFailure,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MetaInsightsError';
  }
}

function failureFor(status: number, detail: string): MetaInsightsFailure {
  // Meta: 190 = token expired or revoked; 10/200-299 = a permission the token lacks; 4/17/32/613 = rate limits.
  const code = Number(/"code"\s*:\s*(\d+)/.exec(detail)?.[1] ?? NaN);
  if (code === 190 || status === 401) return 'auth_failed';
  if (code === 10 || (code >= 200 && code < 300) || status === 403) return 'permission_denied';
  if ([4, 17, 32, 613].includes(code) || status === 429) return 'rate_limited';
  return 'api_error';
}

async function get<T>(accessToken: string, path: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: accessToken });
  let response: Response;
  try {
    response = await fetchImpl(`${BASE_URL}/${path}?${query.toString()}`, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new MetaInsightsError('api_error', `The Meta request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`, 0);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 2000);
    throw new MetaInsightsError(failureFor(response.status, detail), `Meta ${path} failed with status ${response.status}: ${detail}`, response.status);
  }
  return (await response.json()) as T;
}

function count(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function act(adAccountId: string): string {
  return `act_${adAccountId.replace(/^act_/, '')}`;
}

export type MetaAudienceKind = 'custom' | 'lookalike' | 'saved';

/** An audience the ad account already has, with Meta's size range (null when Meta gives none). */
export interface MetaAudience {
  id: string;
  name: string;
  kind: MetaAudienceKind;
  /** Meta's subtype for a custom audience (WEBSITE, CUSTOM, ENGAGEMENT, ...). */
  subtype: string | null;
  sizeLower: number | null;
  sizeUpper: number | null;
}

interface RawAudience {
  id?: string;
  name?: string;
  subtype?: string;
  approximate_count_lower_bound?: number | string;
  approximate_count_upper_bound?: number | string;
}

/**
 * The account's custom (and lookalike) audiences and its saved audiences. Saved audiences are a
 * targeting preset, not an audience id Meta targets by: they are listed so a person sees them, and
 * their targeting is not copied.
 */
export async function listMetaAudiences(accessToken: string, adAccountId: string, fetchImpl: typeof fetch = fetch): Promise<MetaAudience[]> {
  const fields = 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound';
  const [custom, saved] = await Promise.all([
    get<{ data?: RawAudience[] }>(accessToken, `${act(adAccountId)}/customaudiences`, { fields, limit: '200' }, fetchImpl),
    get<{ data?: RawAudience[] }>(accessToken, `${act(adAccountId)}/saved_audiences`, { fields: 'id,name,approximate_count_lower_bound,approximate_count_upper_bound', limit: '200' }, fetchImpl),
  ]);
  const shape = (raw: RawAudience, kind: MetaAudienceKind): MetaAudience | null =>
    raw.id && raw.name
      ? { id: raw.id, name: raw.name, kind, subtype: raw.subtype ?? null, sizeLower: count(raw.approximate_count_lower_bound), sizeUpper: count(raw.approximate_count_upper_bound) }
      : null;
  return [
    ...(custom.data ?? []).map((raw) => shape(raw, raw.subtype === 'LOOKALIKE' ? 'lookalike' : 'custom')),
    ...(saved.data ?? []).map((raw) => shape(raw, 'saved')),
  ].filter((audience): audience is MetaAudience => audience !== null);
}

/** An interest Meta can target, with its audience size range and where it sits in Meta's tree. */
export interface MetaInterest {
  id: string;
  name: string;
  sizeLower: number | null;
  sizeUpper: number | null;
  /** e.g. ["Interests", "Business and industry", "Law"]. */
  path: string[];
}

/** Interests matching a word, biggest first, in the given locale (e.g. he_IL) for their names. */
export async function searchMetaInterests(accessToken: string, query: string, locale: string | null, fetchImpl: typeof fetch = fetch): Promise<MetaInterest[]> {
  const body = await get<{ data?: { id?: string; name?: string; audience_size_lower_bound?: number | string; audience_size_upper_bound?: number | string; path?: string[] }[] }>(
    accessToken,
    'search',
    { type: 'adinterest', q: query, limit: '25', ...(locale ? { locale } : {}) },
    fetchImpl,
  );
  return (body.data ?? [])
    .filter((raw) => raw.id && raw.name)
    .map((raw) => ({ id: raw.id as string, name: raw.name as string, sizeLower: count(raw.audience_size_lower_bound), sizeUpper: count(raw.audience_size_upper_bound), path: Array.isArray(raw.path) ? raw.path : [] }))
    .sort((a, b) => (b.sizeUpper ?? -1) - (a.sizeUpper ?? -1));
}

/** Meta's estimate of the people a targeting spec reaches each month (null when it gives none). */
export interface MetaReachEstimate {
  monthlyLower: number | null;
  monthlyUpper: number | null;
  /** False while Meta is still computing it. */
  ready: boolean;
}

export async function estimateMetaReach(accessToken: string, adAccountId: string, targetingSpec: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<MetaReachEstimate> {
  const body = await get<{ data?: { estimate_mau_lower_bound?: number | string; estimate_mau_upper_bound?: number | string; estimate_ready?: boolean }[] }>(
    accessToken,
    `${act(adAccountId)}/delivery_estimate`,
    { optimization_goal: 'LINK_CLICKS', targeting_spec: JSON.stringify(targetingSpec) },
    fetchImpl,
  );
  const row = body.data?.[0];
  return { monthlyLower: count(row?.estimate_mau_lower_bound), monthlyUpper: count(row?.estimate_mau_upper_bound), ready: row?.estimate_ready !== false };
}

export const META_BREAKDOWNS = { age_gender: ['age', 'gender'], placement: ['publisher_platform', 'platform_position'], country: ['country'] } as const;
export type MetaBreakdown = keyof typeof META_BREAKDOWNS;

/** One segment of the account's past results. */
export interface MetaPerformanceRow {
  /** The segment's values in breakdown order, e.g. ["25-34", "female"] or ["instagram", "story"]. */
  segment: string[];
  spend: number;
  impressions: number;
  clicks: number;
  /** Link clicks, the result every Ad Studio ad optimizes for. */
  linkClicks: number;
  /** Leads and purchases Meta attributed, summed (0 when none were tracked). */
  conversions: number;
}

const CONVERSION_ACTIONS = new Set(['lead', 'offsite_conversion.fb_pixel_lead', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration']);

/**
 * The ad account's results over the last 90 days, by one breakdown, busiest (by spend) first.
 * Account-level, so it covers every campaign the account ran - not only Ad Studio's.
 */
export async function getMetaPerformanceBreakdown(accessToken: string, adAccountId: string, breakdown: MetaBreakdown, fetchImpl: typeof fetch = fetch): Promise<MetaPerformanceRow[]> {
  const keys = META_BREAKDOWNS[breakdown];
  const body = await get<{ data?: Record<string, unknown>[] }>(
    accessToken,
    `${act(adAccountId)}/insights`,
    { level: 'account', date_preset: 'last_90d', fields: 'spend,impressions,clicks,actions', breakdowns: keys.join(','), limit: '500' },
    fetchImpl,
  );
  return (body.data ?? [])
    .map((raw) => {
      const actions = Array.isArray(raw.actions) ? (raw.actions as { action_type?: string; value?: string | number }[]) : [];
      const sum = (match: (type: string) => boolean) => actions.filter((action) => action.action_type && match(action.action_type)).reduce((total, action) => total + (count(action.value) ?? 0), 0);
      return {
        segment: keys.map((key) => String(raw[key] ?? '')),
        spend: count(raw.spend) ?? 0,
        impressions: count(raw.impressions) ?? 0,
        clicks: count(raw.clicks) ?? 0,
        linkClicks: sum((type) => type === 'link_click'),
        conversions: sum((type) => CONVERSION_ACTIONS.has(type)),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}
