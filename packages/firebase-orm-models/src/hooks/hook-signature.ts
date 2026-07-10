import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_HEADER_PREFIX = 'sha256=';

/** Computes the `X-GrowthOS-Signature` header value plan `12 §1` documents: `sha256=<HMAC-SHA256(secret, rawBody) hex digest>`. Exposed mainly so tests (and a future "send a test event" admin action) can produce a validly signed request without duplicating this format. */
export function computeHookSignature(rawBody: string, secret: string): string {
  return `${SIGNATURE_HEADER_PREFIX}${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

/**
 * Verifies an inbound `X-GrowthOS-Signature` header against the raw (un-parsed) request body.
 * Unlike Stripe's scheme (`plugin-runtime/stripe/webhook-signature.ts`), plan `12 §1`'s generic
 * header carries no timestamp, so there is no replay-tolerance window to check here — a boolean
 * result, not a throw, since a bad signature isn't an operational error, just one more thing
 * `hook-ingest.service.ts` records on the durably-stored payload (KAN-53: verify, don't reject).
 */
export function verifyHookSignature(rawBody: string, signatureHeaderValue: string, secret: string): boolean {
  if (!signatureHeaderValue.startsWith(SIGNATURE_HEADER_PREFIX)) {
    return false;
  }
  const providedHex = signatureHeaderValue.slice(SIGNATURE_HEADER_PREFIX.length);
  const expectedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const provided = Buffer.from(providedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
