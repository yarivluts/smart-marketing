export interface RateLimitResult {
  allowed: boolean;
  /** Tokens left in the bucket after this call, floored to a whole number for display. */
  remaining: number;
  /** How long the caller should wait before retrying, in whole seconds. `0` when `allowed` is `true`. */
  retryAfterSeconds: number;
}

/**
 * Per-key rate limiting (KAN-34 AC: "per-key rate limiting ... 429+Retry-After"), provider-agnostic so
 * a real Redis-backed implementation can slot in later without callers changing — see
 * `token-bucket.ts`'s doc comment for why today's implementation is in-process rather than Redis.
 */
export interface RateLimiter {
  /** Attempts to spend `cost` tokens (default 1) from `key`'s own bucket. */
  consume(key: string, cost?: number): RateLimitResult;
}
