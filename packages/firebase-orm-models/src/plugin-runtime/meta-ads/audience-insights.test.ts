import { describe, expect, it, vi } from 'vitest';
import { buildMetaTargetingSpec } from './api-client';
import { estimateMetaReach, getMetaPerformanceBreakdown, listMetaAudiences, MetaInsightsError, searchMetaInterests } from './audience-insights';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function fakeGraph(routes: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const key = url.pathname.replace('/v25.0/', '');
    if (!(key in routes)) throw new Error(`Unexpected ${key}`);
    const body = routes[key];
    return body instanceof Response ? body : json(body);
  });
}

describe('Meta audience lookups', () => {
  it('lists custom, lookalike and saved audiences with their size ranges, by GET with the token as a parameter', async () => {
    const fetchImpl = fakeGraph({
      'act_99/customaudiences': { data: [{ id: '1', name: 'Website visitors', subtype: 'WEBSITE', approximate_count_lower_bound: 1000, approximate_count_upper_bound: '1200' }, { id: '2', name: 'LAL 1%', subtype: 'LOOKALIKE', approximate_count_lower_bound: -1 }, { name: 'no id' }] },
      'act_99/saved_audiences': { data: [{ id: '3', name: 'Lawyers TLV' }] },
    });
    const audiences = await listMetaAudiences('token-1', '99', fetchImpl as unknown as typeof fetch);
    expect(audiences).toEqual([
      { id: '1', name: 'Website visitors', kind: 'custom', subtype: 'WEBSITE', sizeLower: 1000, sizeUpper: 1200 },
      { id: '2', name: 'LAL 1%', kind: 'lookalike', subtype: 'LOOKALIKE', sizeLower: null, sizeUpper: null },
      { id: '3', name: 'Lawyers TLV', kind: 'saved', subtype: null, sizeLower: null, sizeUpper: null },
    ]);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown as [string])[0]));
    expect(url.searchParams.get('access_token')).toBe('token-1');
    expect(url.searchParams.get('fields')).toContain('approximate_count_lower_bound');
  });

  it('searches interests in a locale, biggest first', async () => {
    const fetchImpl = fakeGraph({
      search: { data: [{ id: '10', name: 'Law', audience_size_lower_bound: 100, audience_size_upper_bound: 200, path: ['Interests', 'Law'] }, { id: '11', name: 'Lawyer', audience_size_lower_bound: 5000, audience_size_upper_bound: 9000 }] },
    });
    const interests = await searchMetaInterests('t', 'law', 'he_IL', fetchImpl as unknown as typeof fetch);
    expect(interests.map((interest) => interest.id)).toEqual(['11', '10']);
    expect(interests[1].path).toEqual(['Interests', 'Law']);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown as [string])[0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: 'adinterest', q: 'law', locale: 'he_IL' });
  });

  it('estimates monthly reach for the targeting spec it is given', async () => {
    const fetchImpl = fakeGraph({ 'act_99/delivery_estimate': { data: [{ estimate_mau_lower_bound: 120000, estimate_mau_upper_bound: 140000, estimate_ready: true }] } });
    const spec = buildMetaTargetingSpec({ countries: ['IL'], ageMin: 25, ageMax: 54, genders: ['female'], customAudiences: ['1'], interests: [{ id: '10', name: 'Law' }], advantageAudience: 0 });
    expect(spec).toMatchObject({ custom_audiences: [{ id: '1' }], flexible_spec: [{ interests: [{ id: '10', name: 'Law' }] }], genders: [2] });
    expect(await estimateMetaReach('t', '99', spec, fetchImpl as unknown as typeof fetch)).toEqual({ monthlyLower: 120000, monthlyUpper: 140000, ready: true });
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown as [string])[0]));
    expect(JSON.parse(url.searchParams.get('targeting_spec') as string)).toEqual(spec);
  });

  it('breaks the last 90 days down by segment with link clicks and conversions, biggest spend first', async () => {
    const fetchImpl = fakeGraph({
      'act_99/insights': {
        data: [
          { age: '25-34', gender: 'female', spend: '40.5', impressions: '1000', clicks: '30', actions: [{ action_type: 'link_click', value: '25' }, { action_type: 'lead', value: '3' }] },
          { age: '35-44', gender: 'male', spend: '90', impressions: '2000', clicks: '20', actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '1' }] },
        ],
      },
    });
    const rows = await getMetaPerformanceBreakdown('t', '99', 'age_gender', fetchImpl as unknown as typeof fetch);
    expect(rows).toEqual([
      { segment: ['35-44', 'male'], spend: 90, impressions: 2000, clicks: 20, linkClicks: 0, conversions: 1 },
      { segment: ['25-34', 'female'], spend: 40.5, impressions: 1000, clicks: 30, linkClicks: 25, conversions: 3 },
    ]);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown as [string])[0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ breakdowns: 'age,gender', date_preset: 'last_90d', level: 'account' });
  });

  it('names why Meta refused: an expired token, a missing permission, a rate limit - never echoing the token', async () => {
    const answer = (body: unknown, status: number) => fakeGraph({ 'act_99/insights': new Response(JSON.stringify(body), { status }) }) as unknown as typeof fetch;
    const failure = async (fetchImpl: typeof fetch) => getMetaPerformanceBreakdown('secret-token', '99', 'country', fetchImpl).catch((error: unknown) => error as MetaInsightsError);
    expect((await failure(answer({ error: { code: 190 } }, 400))).failure).toBe('auth_failed');
    expect((await failure(answer({ error: { code: 200 } }, 400))).failure).toBe('permission_denied');
    expect((await failure(answer({ error: { code: 17 } }, 400))).failure).toBe('rate_limited');
    const other = await failure(answer({ error: { code: 1 } }, 500));
    expect(other.failure).toBe('api_error');
    expect(other.message).not.toContain('secret-token');
  });
});
