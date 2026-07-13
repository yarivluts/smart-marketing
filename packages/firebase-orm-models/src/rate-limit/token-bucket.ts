import type { RateLimiter, RateLimitResult } from './rate-limiter';

export class InvalidTokenBucketConfigError extends Error {
  constructor(reason: string) {
    super(`Invalid token bucket rate limiter configuration: ${reason}`);
    this.name = 'InvalidTokenBucketConfigError';
  }
}

export interface TokenBucketRateLimiterOptions {
  /** Maximum tokens a bucket can hold — the largest burst one key may spend at once. */
  capacity: number;
  /** Tokens added back per second, up to `capacity`. */
  refillPerSecond: number;
  /** Injectable clock for tests; defaults to `Date.now`. */
  now?: () => number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

/**
 * A classic token-bucket limiter (KAN-34 AC: "Redis token bucket"), kept in-process rather than
 * backed by a real Redis instance: this repo has no Redis anywhere yet (no dependency, no
 * docker-compose service, no emulator equivalent to Firestore's) — Redis itself is one of the
 * resources KAN-18 (`needs-human`, GCP/Firebase project + infra provisioning) is scoped to provision.
 * Same "buildable today, swap the provider later" split as `vault/local-kms-provider.ts` stood in for
 * a real GCP Cloud KMS key ring until KAN-18 landed. A future `RedisTokenBucketRateLimiter`
 * implementing the same {@link RateLimiter} interface (e.g. via a Lua `INCRBY`+`EXPIRE`/`GETEX` script)
 * is a drop-in replacement — nothing that consumes `RateLimiter` needs to change.
 *
 * Being in-process means state resets on restart and isn't shared across multiple `apps/api`
 * instances — acceptable for today's single-instance deployment, not for a real horizontally-scaled
 * one; that gap closes with the same Redis swap.
 */
export class InMemoryTokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;

  constructor(options: TokenBucketRateLimiterOptions) {
    if (!(options.capacity > 0)) {
      throw new InvalidTokenBucketConfigError('capacity must be a positive number');
    }
    if (!(options.refillPerSecond > 0)) {
      throw new InvalidTokenBucketConfigError('refillPerSecond must be a positive number');
    }
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? Date.now;
  }

  consume(key: string, cost = 1): RateLimitResult {
    const nowMs = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefillMs: nowMs };
    const elapsedSeconds = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
    const refilled = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);

    if (refilled >= cost) {
      const tokens = refilled - cost;
      this.buckets.set(key, { tokens, lastRefillMs: nowMs });
      return { allowed: true, remaining: Math.floor(tokens), retryAfterSeconds: 0 };
    }

    this.buckets.set(key, { tokens: refilled, lastRefillMs: nowMs });
    const deficit = cost - refilled;
    return {
      allowed: false,
      remaining: Math.floor(refilled),
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / this.refillPerSecond)),
    };
  }
}

/**
 * A placeholder default pending real per-key traffic data (tunable per instance once one exists):
 * 10 requests/second sustained, bursting up to 600 (a minute's worth of headroom). Since one ingest
 * request can carry up to `MAX_INGEST_BATCH_SIZE` (1000) records, 10 req/s comfortably clears the "1k
 * events/s sustained" ingest load-test AC while still bounding a single key's overall request rate
 * against every bearer-key route it shares this guard with (ingest, batch lookups, ...).
 */
export const DEFAULT_API_KEY_RATE_LIMIT_CAPACITY = 600;
export const DEFAULT_API_KEY_RATE_LIMIT_REFILL_PER_SECOND = 10;

/** The shared limiter every bearer-API-key-guarded route in `apps/api` consumes from by default. */
export const defaultApiKeyRateLimiter: RateLimiter = new InMemoryTokenBucketRateLimiter({
  capacity: DEFAULT_API_KEY_RATE_LIMIT_CAPACITY,
  refillPerSecond: DEFAULT_API_KEY_RATE_LIMIT_REFILL_PER_SECOND,
});

/**
 * A separate, deliberately smaller budget for MCP tool calls (KAN-77 AC: "rate/token budgets per
 * key"), kept in its own bucket namespace rather than sharing `defaultApiKeyRateLimiter`: an MCP
 * connection is typically driven by an agent issuing one tool call per reasoning step rather than a
 * bulk ingest/query client, so a much lower sustained rate is the right default, and an API key's
 * MCP budget shouldn't compete with (or be silently drained by) the same key's ingest/metrics REST
 * traffic sharing one bucket. 2 requests/second sustained, bursting up to 120 (a minute's headroom)
 * — a placeholder pending real per-key MCP traffic data, same posture `defaultApiKeyRateLimiter`
 * documents for its own numbers.
 */
export const DEFAULT_MCP_RATE_LIMIT_CAPACITY = 120;
export const DEFAULT_MCP_RATE_LIMIT_REFILL_PER_SECOND = 2;

/** The shared limiter `McpAuthGuard` consumes from by default, keyed per credential (API key id, or OAuth grant id) rather than per route — see this file's own doc comment for why MCP gets its own bucket namespace instead of reusing {@link defaultApiKeyRateLimiter}. */
export const defaultMcpRateLimiter: RateLimiter = new InMemoryTokenBucketRateLimiter({
  capacity: DEFAULT_MCP_RATE_LIMIT_CAPACITY,
  refillPerSecond: DEFAULT_MCP_RATE_LIMIT_REFILL_PER_SECOND,
});
