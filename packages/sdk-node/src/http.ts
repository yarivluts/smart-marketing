import { GrowthOSError } from './types.js';

export interface HttpOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof fetch;
  /** Waits between attempts; replaceable in tests. */
  sleep: (ms: number) => Promise<void>;
  userAgent: string;
}

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const MAX_BACKOFF_MS = 30_000;

/** Seconds (or an HTTP date) from a Retry-After header, as milliseconds; null when absent or unusable. */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - now), MAX_BACKOFF_MS) : null;
}

/** Exponential backoff with jitter: about 0.5s, 1s, 2s, 4s ... capped at 30s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(base / 2 + random() * (base / 2));
}

function errorMessage(status: number, body: unknown): string {
  const message =
    body && typeof body === 'object' && 'message' in body
      ? (body as { message: unknown }).message
      : null;
  const text = Array.isArray(message)
    ? message.join('; ')
    : typeof message === 'string'
      ? message
      : null;
  if (status === 401)
    return `GrowthOS refused the API key: ${text ?? 'missing, unknown or revoked'}.`;
  if (status === 403) return `GrowthOS: this key is not allowed here: ${text ?? 'missing scope'}.`;
  return `GrowthOS answered ${status}${text ? `: ${text}` : ''}.`;
}

/**
 * One API call, retried on 429 (honouring Retry-After), 5xx and network/timeout failures up to
 * `maxRetries` times. A 4xx other than 429 is the caller's to fix and is never retried. Throws a
 * {@link GrowthOSError} when it gives up.
 */
export async function request<T>(
  options: HttpOptions,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const url = `${options.baseUrl.replace(/\/+$/, '')}${path}`;
  let lastError: GrowthOSError | null = null;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await options.fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'User-Agent': options.userAgent,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      lastError = new GrowthOSError(
        `Could not reach GrowthOS at ${url}: ${error instanceof Error ? error.message : String(error)}`,
        0,
        true,
      );
      if (attempt < options.maxRetries) await options.sleep(backoffMs(attempt));
      continue;
    }
    if (response.ok) return (await response.json()) as T;
    const parsed: unknown = await response.json().catch(() => null);
    const retryable = response.status === 429 || response.status >= 500;
    lastError = new GrowthOSError(
      errorMessage(response.status, parsed),
      response.status,
      retryable,
    );
    if (!retryable || attempt >= options.maxRetries) throw lastError;
    await options.sleep(retryAfterMs(response.headers.get('retry-after')) ?? backoffMs(attempt));
  }
  throw lastError ?? new GrowthOSError('GrowthOS request failed.', 0, true);
}
