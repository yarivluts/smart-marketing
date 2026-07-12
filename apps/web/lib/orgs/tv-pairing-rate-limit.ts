import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { InMemoryTokenBucketRateLimiter } from '@growthos/firebase-orm-models';

/**
 * Throttles the two write surfaces KAN-67's TV pairing flow exposes with no per-org quota of their
 * own to fall back on: minting (fully anonymous — any caller, no session) and claiming (session-
 * authenticated, but the 6-character human code is guessable within its short TTL if unthrottled).
 * Same `RateLimiter`/token-bucket approach KAN-34 already established for API keys
 * (`InMemoryTokenBucketRateLimiter`) — in-process, so it resets on restart and isn't shared across
 * multiple `apps/web` instances, the same acceptable-for-today gap that limiter's own doc comment
 * already documents pending a real Redis (KAN-18).
 */
const mintRateLimiter = new InMemoryTokenBucketRateLimiter({ capacity: 20, refillPerSecond: 20 / 60 });
const claimRateLimiter = new InMemoryTokenBucketRateLimiter({ capacity: 10, refillPerSecond: 10 / 60 });

/** Best-effort caller IP for the anonymous mint route — the only signal available before any pairing/session exists. Every request sharing one unknown-IP bucket (proxies that strip `x-forwarded-for`) is an acceptable degrade, not a bypass: it makes the shared bucket stricter for everyone behind it, never looser. */
function clientIpKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const firstHop = forwardedFor?.split(',')[0]?.trim();
  return firstHop || request.headers.get('x-real-ip') || 'unknown';
}

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  const response = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
}

/** Rate-limits `POST /api/tv-pairing` (mint) by caller IP. Returns a 429 `NextResponse` when exhausted, `null` when the caller may proceed. */
export function checkMintPairingRateLimit(request: NextRequest): NextResponse | null {
  const result = mintRateLimiter.consume(clientIpKey(request));
  return result.allowed ? null : tooManyRequests(result.retryAfterSeconds);
}

/** Rate-limits a claim attempt by the authenticated user making it. Returns a 429 `NextResponse` when exhausted, `null` when the caller may proceed. */
export function checkClaimPairingRateLimit(userId: string): NextResponse | null {
  const result = claimRateLimiter.consume(userId);
  return result.allowed ? null : tooManyRequests(result.retryAfterSeconds);
}
