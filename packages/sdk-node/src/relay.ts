import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_BASE_URL, SDK_VERSION, envBaseUrl } from './constants.js';
import { request, defaultSleep, type HttpOptions } from './http.js';
import { GrowthOSError } from './types.js';

/**
 * A same-origin relay for sites whose Content-Security-Policy does not allow calling GrowthOS from
 * the page (`connect-src 'self'`): the browser SDK posts to your own route (`endpoint: '/api/growth'`),
 * and this forwards the events with your secret key, which never reaches the page.
 *
 * ```ts
 * // Next.js app/api/growth/route.ts (also Cloudflare Workers, Deno, Bun - any Fetch API runtime).
 * // On edge runtimes import from '@growthos/node/relay': the package root also loads node:crypto.
 * import { createRelayHandler } from '@growthos/node/relay';
 * export const POST = createRelayHandler({ apiKey: process.env.GROWTHOS_API_KEY!, allowedEvents: ['touchpoint', 'page_view', 'cta_click'] });
 * ```
 */
export interface RelayOptions {
  /** A secret server key with ingest.write. */
  apiKey: string;
  baseUrl?: string;
  /**
   * Which event names a page may send through the relay - anything else is dropped (a page is
   * public: without a list, anyone could post any event in your name). Default: touchpoint and
   * page_view only.
   */
  allowedEvents?: readonly string[] | ((event: string) => boolean);
  /** Largest body accepted from a page, in bytes (default 64 KB). */
  maxBodyBytes?: number;
  /** Most events per request from a page (default 100). */
  maxEvents?: number;
  /** Retries toward GrowthOS (default 2: a page is waiting on a beacon, not on us). */
  maxRetries?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_RELAY_EVENTS = ['touchpoint', 'page_view'] as const;

interface PageEvent {
  event_id: string;
  event: string;
  ts: string;
  properties: Record<string, unknown>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isPageEvent(value: unknown): value is PageEvent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.event_id === 'string' &&
    typeof record.event === 'string' &&
    typeof record.ts === 'string' &&
    (record.properties === undefined ||
      (typeof record.properties === 'object' &&
        record.properties !== null &&
        !Array.isArray(record.properties)))
  );
}

/** A Fetch API handler: `(request: Request) => Promise<Response>`. */
export function createRelayHandler(options: RelayOptions): (request: Request) => Promise<Response> {
  if (!options.apiKey || options.apiKey.startsWith('gos_pk_')) {
    throw new Error(
      'GrowthOS relay: pass a secret server key (gos_live_... / gos_test_...), not a publishable one.',
    );
  }
  const allowed = options.allowedEvents ?? DEFAULT_RELAY_EVENTS;
  const isAllowed =
    typeof allowed === 'function' ? allowed : (event: string) => allowed.includes(event);
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  const maxEvents = options.maxEvents ?? 100;
  const http: HttpOptions = {
    baseUrl: options.baseUrl ?? envBaseUrl() ?? DEFAULT_BASE_URL,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs ?? 5000,
    maxRetries: options.maxRetries ?? 2,
    fetch: options.fetch ?? globalThis.fetch,
    sleep: defaultSleep,
    userAgent: `growthos-node-relay/${SDK_VERSION}`,
  };

  return async (incoming: Request): Promise<Response> => {
    if (incoming.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const text = await incoming.text();
    if (text.length > maxBodyBytes) return json({ error: 'too_large' }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    const batch =
      parsed && typeof parsed === 'object' ? (parsed as { batch?: unknown }).batch : undefined;
    if (!Array.isArray(batch) || batch.length === 0) return json({ error: 'empty_batch' }, 400);
    if (batch.length > maxEvents) return json({ error: 'too_many_events' }, 413);
    const events = batch
      .filter(isPageEvent)
      .map((event) => ({ ...event, properties: event.properties ?? {} }));
    const kept = events.filter((event) => isAllowed(event.event));
    const dropped = batch.length - kept.length;
    if (kept.length === 0) return json({ accepted: 0, dropped }, 202);
    try {
      const result = await request<{
        accepted: number;
        quarantined: number;
        duplicates: number;
        rejected?: unknown[];
      }>(http, 'POST', '/v1/ingest/events', { batch: kept });
      return json(
        {
          accepted: result.accepted,
          quarantined: result.quarantined,
          duplicates: result.duplicates,
          dropped,
          ...(result.rejected ? { rejected: result.rejected } : {}),
        },
        202,
      );
    } catch (error) {
      // The page cannot fix our key or GrowthOS being down: say so plainly, keep the detail in the server log.
      console.error(`[growthos relay] ${error instanceof Error ? error.message : String(error)}`);
      return json(
        { error: 'relay_failed' },
        error instanceof GrowthOSError && error.retryable ? 503 : 502,
      );
    }
  };
}

/** The relay for Node's http server or Express: `app.post('/api/growth', createRelayNodeHandler({...}))`. */
export function createRelayNodeHandler(
  options: RelayOptions,
): (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => Promise<void> {
  const handler = createRelayHandler(options);
  return async (req, res) => {
    let body: string;
    if (req.body !== undefined) {
      // A body parser already ran (e.g. express.json() / express.text()).
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } else {
      const chunks: Buffer[] = [];
      for await (const part of req)
        chunks.push(typeof part === 'string' ? Buffer.from(part) : (part as Buffer));
      body = Buffer.concat(chunks).toString('utf8');
    }
    const response = await handler(
      new Request('http://relay.local/', {
        method: req.method ?? 'POST',
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(await response.text());
  };
}
