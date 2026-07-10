import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Generic HMAC-SHA256 verification for KAN-53's inbound hook receiver — the
 * "signature verification options" half of the E9.1 AC, deliberately simpler
 * than `plugin-runtime/stripe/webhook-signature.ts`'s Stripe-specific scheme
 * (no `t=`/`v1=` header format, no replay-tolerance window): most third-party
 * webhook senders (GitHub's `X-Hub-Signature-256`, Shopify's
 * `X-Shopify-Hmac-Sha256`, and the common "just HMAC the raw body" convention
 * generically) just send `HMAC-SHA256(secret, rawBody)` as hex, optionally
 * prefixed `sha256=`. A provider needing Stripe's own timestamped scheme
 * already has its own dedicated webhook route (KAN-49); this is the
 * buildable-today generic fallback for everything else.
 */
export function verifyGenericHmacSignature(rawBody: string, signatureHeaderValue: string, secret: string): boolean {
  const provided = signatureHeaderValue.startsWith('sha256=') ? signatureHeaderValue.slice('sha256='.length) : signatureHeaderValue;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  // `Buffer.from(x, 'hex')` never throws — an odd-length or non-hex string just decodes to fewer
  // bytes than intended, which the length check below already rejects before `timingSafeEqual` runs.
  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
