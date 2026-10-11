import { describe, expect, it, vi } from 'vitest';
import { GrowthOS } from './client';
import { backoffMs, retryAfterMs } from './http';
import { eventId } from './ids';
import { GrowthOSError } from './types';

const BASE = 'https://api.test';

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function batchAnswer(kind: string, count: number, rejected?: unknown[]) {
  return {
    batch_id: `b-${Math.random()}`,
    kind,
    accepted: count - (rejected?.length ?? 0),
    quarantined: rejected?.length ?? 0,
    duplicates: 0,
    total: count,
    ...(rejected ? { rejected } : {}),
  };
}

function client(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof GrowthOS>[0]> = {},
) {
  const growthos = new GrowthOS({
    apiKey: 'gos_test_secret',
    baseUrl: BASE,
    fetch: fetchImpl,
    flushIntervalMs: 0,
    ...extra,
  });
  growthos.setSleep(async () => undefined);
  return growthos;
}

describe('GrowthOS (node)', () => {
  it('puts identity inside properties, groups by kind and entity type, and returns what happened to each record', async () => {
    const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
      [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body, headers: init.headers as Record<string, string> });
      if (url.endsWith('/events'))
        return response(
          202,
          batchAnswer('event', 2, [
            { client_id: 'e2', status: 'quarantined', reasons: ['unregistered_field:planz'] },
          ]),
        );
      return response(202, batchAnswer(url.endsWith('/entities') ? 'entity' : 'measure', 1));
    });
    const growthos = client(fetchImpl as unknown as typeof fetch);
    growthos.track({
      event: 'signup',
      eventId: 'e1',
      ts: '2026-10-05T10:00:00Z',
      anonId: 'anon-1',
      customerId: 'u1',
      properties: { plan: 'free' },
    });
    growthos.track({
      event: 'signup',
      eventId: 'e2',
      ts: new Date('2026-10-05T10:01:00Z'),
      properties: { planz: 'x' },
    });
    growthos.customer('u1', { plan: 'free' });
    growthos.entity('account', 'a1', { seats: 3 });
    growthos.measure({
      measure: 'ad_spend',
      value: 12.5,
      ts: '2026-10-05T00:00:00Z',
      dimensions: { channel: 'google' },
    });
    const result = await growthos.flush();

    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/v1/ingest/events`,
      `${BASE}/v1/ingest/entities`,
      `${BASE}/v1/ingest/entities`,
      `${BASE}/v1/ingest/measures`,
    ]);
    expect(calls[0].body).toEqual({
      batch: [
        {
          event_id: 'e1',
          event: 'signup',
          ts: '2026-10-05T10:00:00Z',
          properties: { plan: 'free', anon_id: 'anon-1', customer_id: 'u1' },
        },
        {
          event_id: 'e2',
          event: 'signup',
          ts: '2026-10-05T10:01:00.000Z',
          properties: { planz: 'x' },
        },
      ],
    });
    expect(calls[1].body).toEqual({
      type: 'customer',
      records: [{ id: 'u1', attributes: { plan: 'free' } }],
    });
    expect(calls[2].body).toEqual({
      type: 'account',
      records: [{ id: 'a1', attributes: { seats: 3 } }],
    });
    expect(calls[0].headers.Authorization).toBe('Bearer gos_test_secret');
    expect(result).toMatchObject({
      ok: false,
      accepted: 4,
      quarantined: 1,
      rejected: [{ clientId: 'e2', status: 'quarantined', reasons: ['unregistered_field:planz'] }],
      errors: [],
    });
  });

  it('sends on its own once flushAt records are waiting, in batches of at most 1000', async () => {
    const sizes: number[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const batch = (JSON.parse(String(init.body)) as { batch: unknown[] }).batch;
      sizes.push(batch.length);
      return response(202, batchAnswer('event', batch.length));
    });
    const growthos = client(fetchImpl as unknown as typeof fetch, { flushAt: 2 });
    growthos.track({ event: 'page_view' });
    expect(fetchImpl).not.toHaveBeenCalled();
    growthos.track({ event: 'page_view' });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const big = client(fetchImpl as unknown as typeof fetch);
    sizes.length = 0;
    await big.sendEvents(
      Array.from({ length: 2500 }, (_, index) => ({ event: 'page_view', eventId: `e${index}` })),
    );
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it('retries 429 after Retry-After and 5xx with backoff, but never a 4xx it cannot fix', async () => {
    const slept: number[] = [];
    let attempts = 0;
    const flaky = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) return response(429, { message: 'slow down' }, { 'Retry-After': '2' });
      if (attempts === 2) return response(503, {});
      return response(202, batchAnswer('event', 1));
    });
    const growthos = client(flaky as unknown as typeof fetch);
    growthos.setSleep(async (ms) => void slept.push(ms));
    const result = await growthos.sendEvents([{ event: 'signup', eventId: 'e1' }]);
    expect(result.accepted).toBe(1);
    expect(slept[0]).toBe(2000);
    expect(slept).toHaveLength(2);

    const refused = vi.fn(async () =>
      response(403, { message: 'This API key does not carry the required scope.' }),
    );
    const strict = client(refused as unknown as typeof fetch);
    await expect(strict.sendEvents([{ event: 'signup' }])).rejects.toMatchObject({
      status: 403,
      retryable: false,
    });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('a queued batch that cannot be delivered is reported, never thrown', async () => {
    const onError = vi.fn();
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const growthos = client(down as unknown as typeof fetch, { maxRetries: 1, onError });
    growthos.track({ event: 'signup' });
    const result = await growthos.flush();
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toBeInstanceOf(GrowthOSError);
    expect(result.errors[0]).toMatchObject({ status: 0, retryable: true });
    expect(down).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('refuses a publishable key on a server, and a missing key', () => {
    expect(() => new GrowthOS({ apiKey: 'gos_pk_live_x' })).toThrow('publishable');
    expect(() => new GrowthOS({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('verifies, validates and tags backfill batches against the right routes', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      if (url.includes('/verify'))
        return response(200, { key: { kind: 'secret' }, report: { status: 'ok', schemas: [] } });
      if (url.includes('/validate'))
        return response(200, {
          kind: 'event',
          total: 1,
          valid: 0,
          invalid: 1,
          records: [{ client_id: 'e1', status: 'invalid', reasons: ['schema_not_registered:x'] }],
        });
      if (url.includes('/complete')) return response(200, {});
      return response(202, batchAnswer('entity', 1));
    });
    const growthos = client(fetchImpl as unknown as typeof fetch);
    await growthos.verify({ expect: ['touchpoint', 'signup'] });
    expect(seen[0].url).toBe(`${BASE}/v1/ingest/verify?expect=touchpoint%2Csignup`);
    expect(await growthos.validateEvents([{ event: 'x', eventId: 'e1' }])).toEqual({
      kind: 'event',
      total: 1,
      valid: 0,
      invalid: 1,
      records: [{ clientId: 'e1', valid: false, reasons: ['schema_not_registered:x'] }],
    });

    const backfill = growthos.forBackfill('bf_1');
    await backfill.sendEntities('customer', [{ id: 'u1', attributes: {} }]);
    expect((seen[2].init.headers as Record<string, string>)['X-GrowthOS-Backfill-Id']).toBe('bf_1');
    await growthos.completeBackfill('bf_1', { status: 'completed', recordsSent: 1, batches: 1 });
    expect(seen[3].url).toBe(`${BASE}/v1/backfills/bf_1/complete`);
    expect(JSON.parse(String(seen[3].init.body))).toEqual({
      status: 'completed',
      records_sent: 1,
      batches: 1,
    });
  });

  it('sends nothing when disabled', async () => {
    const fetchImpl = vi.fn();
    const growthos = client(fetchImpl as unknown as typeof fetch, { disabled: true });
    growthos.track({ event: 'signup' });
    expect(await growthos.flush()).toMatchObject({ ok: true, accepted: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('makes stable event ids from your own data', () => {
    expect(eventId('document_signed', 'doc-1')).toBe(eventId('document_signed', 'doc-1'));
    expect(eventId('document_signed', 'doc-1')).not.toBe(eventId('document_signed', 'doc-2'));
    expect(eventId('a', new Date('2026-10-05T00:00:00Z'))).toBe(
      eventId('a', '2026-10-05T00:00:00.000Z'),
    );
    expect(eventId('x')).toMatch(/^evt_[0-9a-f]{32}$/);
    expect(() => eventId()).toThrow();
  });

  it('reads Retry-After as seconds or a date, and backs off exponentially with a cap', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('999')).toBe(30_000);
    expect(backoffMs(0, () => 1)).toBe(500);
    expect(backoffMs(1, () => 0)).toBe(500);
    expect(backoffMs(20, () => 1)).toBe(30_000);
  });
});
