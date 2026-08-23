import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrmWebhookApiError, CrmWebhookHttpApiClient } from './api-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('CrmWebhookHttpApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the records as JSON with bearer auth to the configured URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new CrmWebhookHttpApiClient();
    await client.pushRecords({
      webhookUrl: 'https://crm.example.com/hooks/growthos',
      bearerToken: 'tok_abc',
      records: [{ entity_id: 'cust_1' }, { entity_id: 'cust_2' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://crm.example.com/hooks/growthos');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_abc');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ records: [{ entity_id: 'cust_1' }, { entity_id: 'cust_2' }] });
  });

  it('throws CrmWebhookApiError with the response status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 502)));

    const client = new CrmWebhookHttpApiClient();
    await expect(client.pushRecords({ webhookUrl: 'https://crm.example.com/hooks/growthos', bearerToken: 'tok_abc', records: [] })).rejects.toMatchObject({
      status: 502,
    });
    await expect(
      client.pushRecords({ webhookUrl: 'https://crm.example.com/hooks/growthos', bearerToken: 'tok_abc', records: [] }),
    ).rejects.toBeInstanceOf(CrmWebhookApiError);
  });
});
