import { createHmac, timingSafeEqual } from 'node:crypto';

export class StripeWebhookSignatureError extends Error {
  constructor(reason: string) {
    super(`Stripe webhook signature verification failed: ${reason}`);
    this.name = 'StripeWebhookSignatureError';
  }
}

/** Default tolerance Stripe's own libraries use for how old a signed timestamp may be before it's rejected as a possible replay. */
export const DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

interface ParsedStripeSignatureHeader {
  timestamp: number;
  signatures: string[];
}

/** Parses a `Stripe-Signature` header, e.g. `t=1614556800,v1=abc123,v1=def456` — `v1` may repeat (Stripe sends one per active signing secret during rotation). */
function parseSignatureHeader(header: string): ParsedStripeSignatureHeader {
  let timestamp: number | undefined;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't' && value) {
      timestamp = Number.parseInt(value, 10);
    } else if (key === 'v1' && value) {
      signatures.push(value);
    }
  }

  if (timestamp === undefined || Number.isNaN(timestamp)) {
    throw new StripeWebhookSignatureError('missing or malformed timestamp (`t=`)');
  }
  if (signatures.length === 0) {
    throw new StripeWebhookSignatureError('missing a `v1=` signature');
  }
  return { timestamp, signatures };
}

function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Verifies a Stripe webhook's `Stripe-Signature` header against the raw
 * (un-parsed) request body, replicating Stripe's own documented scheme —
 * `HMAC-SHA256(secret, "{timestamp}.{rawBody}")` compared against each
 * `v1=` signature — without depending on the `stripe` npm SDK. Pure HMAC
 * verification, no network call, so this is fully unit-testable without a
 * real Stripe account. Throws {@link StripeWebhookSignatureError} on any
 * mismatch, a malformed header, or a timestamp older than `toleranceSeconds`
 * (replay protection); callers must reject the request (not land it) when
 * this throws.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSigningSecret: string,
  toleranceSeconds: number = DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): void {
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new StripeWebhookSignatureError('timestamp is outside the allowed tolerance');
  }

  const expected = createHmac('sha256', webhookSigningSecret).update(`${timestamp}.${rawBody}`).digest('hex');

  const matches = signatures.some((signature) => safeEqualHex(expected, signature));
  if (!matches) {
    throw new StripeWebhookSignatureError('no `v1=` signature matched the computed HMAC');
  }
}
