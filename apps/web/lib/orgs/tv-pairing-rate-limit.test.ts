import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { checkClaimPairingRateLimit, checkMintPairingRateLimit } from './tv-pairing-rate-limit';

/** Every case below uses its own IP/user id so the shared module-level buckets (mint capacity 20, claim capacity 10) never trip across unrelated cases — same convention `route.test.ts` establishes for this module. */
function mintRequestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://growthos.test/api/tv-pairing', { method: 'POST', headers });
}

function exhaustMint(headers: Record<string, string>, times = 20): void {
  for (let i = 0; i < times; i += 1) {
    expect(checkMintPairingRateLimit(mintRequestWith(headers))).toBeNull();
  }
}

describe('checkMintPairingRateLimit', () => {
  it('allows a fresh caller identified by a single x-forwarded-for value', () => {
    expect(checkMintPairingRateLimit(mintRequestWith({ 'x-forwarded-for': '198.51.100.10' }))).toBeNull();
  });

  it('keys on the first hop of a multi-value x-forwarded-for header, trimming surrounding whitespace', () => {
    const ip = '198.51.100.20';
    exhaustMint({ 'x-forwarded-for': ` ${ip} , 203.0.113.50` });

    const blocked = checkMintPairingRateLimit(mintRequestWith({ 'x-forwarded-for': ip }));
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);

    const otherFirstHop = checkMintPairingRateLimit(mintRequestWith({ 'x-forwarded-for': '203.0.113.51' }));
    expect(otherFirstHop).toBeNull();
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const ip = '198.51.100.30';
    exhaustMint({ 'x-real-ip': ip });

    const blocked = checkMintPairingRateLimit(mintRequestWith({ 'x-real-ip': ip }));
    expect(blocked).not.toBeNull();

    const otherIp = checkMintPairingRateLimit(mintRequestWith({ 'x-real-ip': '198.51.100.31' }));
    expect(otherIp).toBeNull();
  });

  it('falls back to a shared "unknown" bucket when neither header is present, without throwing', () => {
    expect(() => checkMintPairingRateLimit(mintRequestWith({}))).not.toThrow();
    expect(checkMintPairingRateLimit(mintRequestWith({}))).toBeNull();
  });

  it('returns 429 with a Retry-After header and the documented error body once exhausted', async () => {
    const ip = '198.51.100.40';
    exhaustMint({ 'x-forwarded-for': ip });

    const blocked = checkMintPairingRateLimit(mintRequestWith({ 'x-forwarded-for': ip }));
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toEqual(expect.any(String));
    await expect(blocked?.json()).resolves.toEqual({ error: 'rate_limited' });
  });
});

describe('checkClaimPairingRateLimit', () => {
  it('allows a fresh caller and returns null', () => {
    expect(checkClaimPairingRateLimit('user-fresh')).toBeNull();
  });

  it('returns 429 once the per-user bucket (capacity 10) is exhausted', async () => {
    const userId = 'user-exhausted';
    for (let i = 0; i < 10; i += 1) {
      expect(checkClaimPairingRateLimit(userId)).toBeNull();
    }

    const blocked = checkClaimPairingRateLimit(userId);
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toEqual(expect.any(String));
    await expect(blocked?.json()).resolves.toEqual({ error: 'rate_limited' });
  });

  it('keeps distinct users in separate buckets', () => {
    const exhaustedUser = 'user-a';
    for (let i = 0; i < 10; i += 1) {
      checkClaimPairingRateLimit(exhaustedUser);
    }
    expect(checkClaimPairingRateLimit(exhaustedUser)).not.toBeNull();
    expect(checkClaimPairingRateLimit('user-b')).toBeNull();
  });
});
