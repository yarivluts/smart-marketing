import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a backfill request GrowthOS sent to your endpoint (Standard Webhooks: headers
 * webhook-id, webhook-timestamp, webhook-signature; secret `whsec_<base64>` shown once when the
 * endpoint was set). Pass the RAW request body - a re-serialized JSON body has different bytes.
 *
 * ```ts
 * const check = verifyBackfillRequest({ secret: process.env.GROWTHOS_BACKFILL_SECRET!, headers: req.headers, body: rawBody });
 * if (!check.ok) return res.status(401).end();
 * res.status(202).end(); // answer fast, then resend with growthos.forBackfill(check.request.backfill_id)
 * ```
 */
export interface BackfillRequest {
  type: 'backfill.requested';
  backfill_id: string;
  project_id: string;
  environment: 'dev' | 'staging' | 'prod';
  schemas: { kind: 'event' | 'entity' | 'measure'; name: string }[];
  requested_at: string;
}

export type BackfillVerification =
  | { ok: true; request: BackfillRequest; webhookId: string }
  | {
      ok: false;
      reason:
        'missing_headers' | 'stale_timestamp' | 'bad_signature' | 'bad_secret' | 'invalid_body';
    };

type HeaderBag = Record<string, string | string[] | undefined> | Headers;

function header(headers: HeaderBag, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function')
    return (headers as Headers).get(name) ?? undefined;
  const value =
    (headers as Record<string, string | string[] | undefined>)[name] ??
    (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function verifyBackfillRequest(params: {
  secret: string;
  headers: HeaderBag;
  body: string | Buffer;
  /** How old a request may be (default 300 s), against replays. */
  toleranceSeconds?: number;
  now?: Date;
}): BackfillVerification {
  const id = header(params.headers, 'webhook-id');
  const timestamp = header(params.headers, 'webhook-timestamp');
  const signatures = header(params.headers, 'webhook-signature');
  if (!id || !timestamp || !signatures) return { ok: false, reason: 'missing_headers' };
  const seconds = Number(timestamp);
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  if (
    !Number.isFinite(seconds) ||
    Math.abs(nowSeconds - seconds) > (params.toleranceSeconds ?? 300)
  )
    return { ok: false, reason: 'stale_timestamp' };
  if (!params.secret.startsWith('whsec_')) return { ok: false, reason: 'bad_secret' };
  const key = Buffer.from(params.secret.slice('whsec_'.length), 'base64');
  const body = typeof params.body === 'string' ? params.body : params.body.toString('utf8');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  // The header may carry several space-separated signatures (key rotation): any v1 match passes.
  const matches = signatures.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) return { ok: false, reason: 'bad_signature' };
  try {
    const request = JSON.parse(body) as BackfillRequest;
    if (request.type !== 'backfill.requested' || typeof request.backfill_id !== 'string')
      return { ok: false, reason: 'invalid_body' };
    return { ok: true, request, webhookId: id };
  } catch {
    return { ok: false, reason: 'invalid_body' };
  }
}
