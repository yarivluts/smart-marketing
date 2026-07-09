import { afterEach, describe, expect, it, vi } from 'vitest';
import { StripeApiError, StripeHttpApiClient } from './api-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('StripeHttpApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a bearer-auth GET to the right path with limit/starting_after/created[gte]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: 'list', data: [], has_more: false }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new StripeHttpApiClient('sk_test_123');
    await client.listCharges({ limit: 50, startingAfter: 'ch_5', createdGte: 1_700_000_000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.stripe.com/v1/charges?');
    expect(url).toContain('limit=50');
    expect(url).toContain('starting_after=ch_5');
    expect(url).toContain('created%5Bgte%5D=1700000000');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_123');
  });

  it('omits starting_after and created[gte] when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: 'list', data: [], has_more: false }));
    vi.stubGlobal('fetch', fetchMock);

    await new StripeHttpApiClient('sk_test_123').listInvoices({ limit: 10 });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('starting_after');
    expect(url).not.toContain('created%5Bgte%5D');
  });

  it('requests subscriptions with status=all so canceled subscriptions are still visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: 'list', data: [], has_more: false }));
    vi.stubGlobal('fetch', fetchMock);

    await new StripeHttpApiClient('sk_test_123').listSubscriptions({ limit: 10 });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('status=all');
  });

  it('returns the parsed list page on success', async () => {
    const page = { object: 'list' as const, data: [{ id: 're_1' }], has_more: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(page)));

    const result = await new StripeHttpApiClient('sk_test_123').listRefunds({ limit: 10 });
    expect(result).toEqual(page);
  });

  it('throws StripeApiError with the response status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 401)));

    await expect(new StripeHttpApiClient('sk_bad').listCharges({ limit: 10 })).rejects.toMatchObject({
      status: 401,
    });
    await expect(new StripeHttpApiClient('sk_bad').listCharges({ limit: 10 })).rejects.toBeInstanceOf(StripeApiError);
  });
});
