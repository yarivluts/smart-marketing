import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ga4ApiError, Ga4HttpApiClient } from './api-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('Ga4HttpApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a bearer-auth POST to the runReport endpoint with a single-day date range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ dimensionHeaders: [], metricHeaders: [], rows: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new Ga4HttpApiClient('ya29.test');
    await client.runReport({ propertyId: 'properties/123', date: '2026-07-01', dimensions: ['sessionSource'], metrics: ['sessions'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ya29.test');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      dateRanges: [{ startDate: '2026-07-01', endDate: '2026-07-01' }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
    });
  });

  it('returns the parsed report on success', async () => {
    const report = { dimensionHeaders: [{ name: 'sessionSource' }], metricHeaders: [{ name: 'sessions' }], rows: [{ dimensionValues: [{ value: 'google' }], metricValues: [{ value: '5' }] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(report)));

    const result = await new Ga4HttpApiClient('ya29.test').runReport({ propertyId: 'properties/123', date: '2026-07-01', dimensions: [], metrics: [] });
    expect(result).toEqual(report);
  });

  it('throws Ga4ApiError with the response status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 401)));

    await expect(new Ga4HttpApiClient('bad').runReport({ propertyId: 'properties/123', date: '2026-07-01', dimensions: [], metrics: [] })).rejects.toMatchObject({
      status: 401,
    });
    await expect(new Ga4HttpApiClient('bad').runReport({ propertyId: 'properties/123', date: '2026-07-01', dimensions: [], metrics: [] })).rejects.toBeInstanceOf(
      Ga4ApiError,
    );
  });
});
