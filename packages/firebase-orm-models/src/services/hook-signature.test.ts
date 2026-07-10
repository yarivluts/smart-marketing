import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGenericHmacSignature } from './hook-signature';

describe('verifyGenericHmacSignature', () => {
  const secret = 'shared-secret';
  const rawBody = JSON.stringify({ event: 'ping', id: 1 });
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');

  it('accepts a bare hex digest', () => {
    expect(verifyGenericHmacSignature(rawBody, digest, secret)).toBe(true);
  });

  it('accepts a "sha256=" prefixed digest (GitHub-style)', () => {
    expect(verifyGenericHmacSignature(rawBody, `sha256=${digest}`, secret)).toBe(true);
  });

  it('rejects a digest computed with the wrong secret', () => {
    const wrong = createHmac('sha256', 'a-different-secret').update(rawBody).digest('hex');
    expect(verifyGenericHmacSignature(rawBody, wrong, secret)).toBe(false);
  });

  it('rejects a digest computed over a different body', () => {
    const wrong = createHmac('sha256', secret).update(JSON.stringify({ event: 'tampered' })).digest('hex');
    expect(verifyGenericHmacSignature(rawBody, wrong, secret)).toBe(false);
  });

  it('rejects a malformed/non-hex header value without throwing', () => {
    expect(verifyGenericHmacSignature(rawBody, 'not-hex-at-all', secret)).toBe(false);
    expect(verifyGenericHmacSignature(rawBody, '', secret)).toBe(false);
  });
});
