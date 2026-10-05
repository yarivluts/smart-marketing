import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createRelayHandler } from './relay';
import { verifyBackfillRequest } from './backfill';
import { formatVerification } from './verify-format';

const EVENT = (event: string, id = 'e1') => ({
  event_id: id,
  event,
  ts: '2026-10-05T10:00:00Z',
  properties: { anon_id: 'a1' },
});

describe('relay', () => {
  it('forwards only the allowed events from the page with the secret key, and says what it dropped', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const batch = (JSON.parse(String(init.body)) as { batch: unknown[] }).batch;
      return new Response(
        JSON.stringify({
          batch_id: 'b',
          kind: 'event',
          accepted: batch.length,
          quarantined: 0,
          duplicates: 0,
          total: batch.length,
        }),
        { status: 202 },
      );
    });
    const relay = createRelayHandler({
      apiKey: 'gos_live_secret',
      baseUrl: 'https://api.test',
      allowedEvents: ['touchpoint', 'cta_click'],
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const response = await relay(
      new Request('https://site.test/api/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          batch: [
            EVENT('touchpoint'),
            EVENT('cta_click', 'e2'),
            EVENT('purchase', 'e3'),
            { junk: true },
          ],
        }),
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: 2,
      quarantined: 0,
      duplicates: 0,
      dropped: 2,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/ingest/events');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gos_live_secret');
    expect(
      (JSON.parse(String(init.body)) as { batch: { event: string }[] }).batch.map(
        (event) => event.event,
      ),
    ).toEqual(['touchpoint', 'cta_click']);
  });

  it('refuses bad bodies, other methods and oversize batches without calling GrowthOS, and hides upstream errors', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: 'invalid key' }), { status: 401 }),
    );
    const relay = createRelayHandler({
      apiKey: 'gos_live_secret',
      baseUrl: 'https://api.test',
      fetch: fetchImpl as unknown as typeof fetch,
      maxEvents: 2,
    });
    const post = (body: string) =>
      relay(new Request('https://site.test/r', { method: 'POST', body }));
    expect((await relay(new Request('https://site.test/r'))).status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post(JSON.stringify({ batch: [] }))).status).toBe(400);
    expect(
      (
        await post(
          JSON.stringify({
            batch: [EVENT('touchpoint'), EVENT('touchpoint'), EVENT('touchpoint')],
          }),
        )
      ).status,
    ).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
    const failed = await post(JSON.stringify({ batch: [EVENT('touchpoint')] }));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'relay_failed' });
    expect(() => createRelayHandler({ apiKey: 'gos_pk_live_x' })).toThrow('secret');
  });
});

describe('backfill requests', () => {
  const secret = `whsec_${Buffer.from('k'.repeat(32)).toString('base64')}`;
  const body = JSON.stringify({
    type: 'backfill.requested',
    backfill_id: 'bf_1',
    project_id: 'p',
    environment: 'prod',
    schemas: [{ kind: 'entity', name: 'customer' }],
    requested_at: '2026-10-05T10:00:00Z',
  });
  const now = new Date('2026-10-05T10:00:30Z');
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const sign = (key: Buffer) =>
    `v1,${createHmac('sha256', key).update(`wh_1.${timestamp}.${body}`).digest('base64')}`;
  const headers = (signature: string, ts = timestamp) => ({
    'webhook-id': 'wh_1',
    'webhook-timestamp': ts,
    'webhook-signature': signature,
  });

  it('accepts a request signed with the endpoint secret (any of several signatures) and returns it', () => {
    const result = verifyBackfillRequest({
      secret,
      headers: headers(`v1,AAAA ${sign(Buffer.from('k'.repeat(32)))}`),
      body,
      now,
    });
    expect(result).toMatchObject({ ok: true, webhookId: 'wh_1', request: { backfill_id: 'bf_1' } });
    // The Fetch API Headers form works too.
    expect(
      verifyBackfillRequest({
        secret,
        headers: new Headers(headers(sign(Buffer.from('k'.repeat(32))))),
        body,
        now,
      }).ok,
    ).toBe(true);
  });

  it('refuses a wrong signature, an old timestamp, missing headers and a changed body', () => {
    expect(
      verifyBackfillRequest({
        secret,
        headers: headers(sign(Buffer.from('x'.repeat(32)))),
        body,
        now,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' });
    expect(
      verifyBackfillRequest({
        secret,
        headers: headers(sign(Buffer.from('k'.repeat(32))), String(Number(timestamp) - 3600)),
        body,
        now,
      }),
    ).toEqual({ ok: false, reason: 'stale_timestamp' });
    expect(verifyBackfillRequest({ secret, headers: {}, body, now })).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
    expect(
      verifyBackfillRequest({
        secret,
        headers: headers(sign(Buffer.from('k'.repeat(32)))),
        body: body.replace('bf_1', 'bf_2'),
        now,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('verify output', () => {
  it('prints one line per schema with the fix, and the overall status', () => {
    const text = formatVerification({
      key: {
        kind: 'secret',
        prefix: 'gos_live_ab12',
        scopes: ['ingest.write'],
        allowedOrigins: [],
      },
      project: { id: 'p1', name: 'Website' },
      environment: { id: 'e1', name: 'prod' },
      report: {
        status: 'attention',
        schemas: [
          {
            name: 'touchpoint',
            kind: 'event',
            status: 'receiving',
            registered: true,
            lastAcceptedAt: '2026-10-05T10:00:00Z',
            openQuarantined: 0,
            quarantineReasons: [],
            fix: null,
          },
          {
            name: 'signup',
            kind: 'event',
            status: 'quarantined',
            registered: true,
            lastAcceptedAt: null,
            openQuarantined: 3,
            quarantineReasons: ['missing_required_field:plan'],
            fix: 'Every "signup" record was rejected.',
          },
        ],
      },
    });
    expect(text).toContain('Project:     Website (p1)');
    expect(text).toContain('[OK  ] touchpoint');
    expect(text).toContain('[FAIL] signup');
    expect(text).toContain('3 in quarantine');
    expect(text).toContain('-> Every "signup" record was rejected.');
    expect(text).toContain('Status: needs attention');
  });
});
