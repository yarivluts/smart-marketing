import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StripeWebhookSignatureError, verifyStripeWebhookSignature } from './webhook-signature';

const SECRET = 'whsec_test_secret';
const BODY = '{"id":"evt_1","type":"charge.succeeded"}';

function signedHeader(body: string, secret: string, timestamp: number, extraSignatures: string[] = []): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return [`t=${timestamp}`, `v1=${signature}`, ...extraSignatures.map((sig) => `v1=${sig}`)].join(',');
}

describe('verifyStripeWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const now = 1_700_000_000;
    const header = signedHeader(BODY, SECRET, now);
    expect(() => verifyStripeWebhookSignature(BODY, header, SECRET, 300, now)).not.toThrow();
  });

  it('accepts when any one of several v1= signatures matches (secret-rotation window)', () => {
    const now = 1_700_000_000;
    const header = signedHeader(BODY, SECRET, now, ['deadbeef'.repeat(8)]);
    expect(() => verifyStripeWebhookSignature(BODY, header, SECRET, 300, now)).not.toThrow();
  });

  it('rejects a signature computed with the wrong secret', () => {
    const now = 1_700_000_000;
    const header = signedHeader(BODY, 'whsec_wrong_secret', now);
    expect(() => verifyStripeWebhookSignature(BODY, header, SECRET, 300, now)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a body that was tampered with after signing', () => {
    const now = 1_700_000_000;
    const header = signedHeader(BODY, SECRET, now);
    expect(() => verifyStripeWebhookSignature(`${BODY} `, header, SECRET, 300, now)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a timestamp outside the tolerance window (replay protection)', () => {
    const now = 1_700_000_000;
    const header = signedHeader(BODY, SECRET, now - 1000);
    expect(() => verifyStripeWebhookSignature(BODY, header, SECRET, 300, now)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a header missing the timestamp', () => {
    expect(() => verifyStripeWebhookSignature(BODY, 'v1=abc123', SECRET)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a header missing any v1= signature', () => {
    expect(() => verifyStripeWebhookSignature(BODY, 't=1700000000', SECRET)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a signature of the wrong length rather than throwing from timingSafeEqual', () => {
    const now = 1_700_000_000;
    const header = `t=${now},v1=abcd`;
    expect(() => verifyStripeWebhookSignature(BODY, header, SECRET, 300, now)).toThrow(StripeWebhookSignatureError);
  });
});
