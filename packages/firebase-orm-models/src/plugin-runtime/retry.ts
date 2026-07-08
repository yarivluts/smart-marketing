export class InvalidRetryBackoffConfigError extends Error {
  constructor(reason: string) {
    super(`Invalid retry/backoff configuration: ${reason}`);
    this.name = 'InvalidRetryBackoffConfigError';
  }
}

export interface RetryBackoffOptions {
  /** Total attempts, including the first — 1 means "no retry." */
  maxAttempts: number;
  /** Delay before the 2nd attempt; each subsequent attempt multiplies by `factor`. */
  baseDelayMs: number;
  /** Defaults to 2 (classic exponential backoff). */
  factor?: number;
  /** Injectable for tests — defaults to a real `setTimeout`-based sleep so a retrying caller doesn't actually wait in a test suite. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryBackoffResult<T> {
  result: T;
  /** How many attempts it actually took — 1 means it succeeded on the first try. */
  attempts: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying on a thrown error with exponential backoff between
 * attempts (plan `13 §E7.2`'s "retry/backoff" AC) — up to `maxAttempts`
 * total tries. Rethrows the *last* attempt's own error once attempts are
 * exhausted, so a caller's `catch` sees the most recent failure reason
 * rather than the first one.
 */
export async function runWithRetryBackoff<T>(fn: (attempt: number) => Promise<T>, options: RetryBackoffOptions): Promise<RetryBackoffResult<T>> {
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
    throw new InvalidRetryBackoffConfigError('maxAttempts must be a positive integer');
  }
  if (!(options.baseDelayMs >= 0)) {
    throw new InvalidRetryBackoffConfigError('baseDelayMs must be a non-negative number');
  }

  const factor = options.factor ?? 2;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (error) {
      if (attempt >= options.maxAttempts) {
        throw error;
      }
      await sleep(options.baseDelayMs * factor ** (attempt - 1));
    }
  }
  // Unreachable — the loop above always either returns or throws before exiting.
  throw new InvalidRetryBackoffConfigError('runWithRetryBackoff exited its loop without resolving');
}
