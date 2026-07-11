import 'server-only';
import { listWinEventsSince } from '@/lib/orgs/queries';
import { toWinEventFeedItem } from '@/lib/orgs/win-rule-view';

/** How often the stream re-checks Firestore for new wins — well under the AC's "<5s" budget. */
export const WIN_FEED_POLL_INTERVAL_MS = 1500;

/** Bounds one connection's lifetime so a long-lived TV-mode tab can't hold its poll loop open forever; `EventSource` reconnects automatically, replaying `?since=` from the last event id it saw. */
export const WIN_FEED_MAX_STREAM_DURATION_MS = 10 * 60 * 1000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export interface CreateWinFeedStreamParams {
  organizationId: string;
  projectId: string;
  /** ISO cursor to resume from — everything created strictly after this is flushed. */
  since: string;
  signal: AbortSignal;
  pollIntervalMs?: number;
  maxDurationMs?: number;
}

/**
 * KAN-65's realtime win feed transport (AC: "ingest -> Pub/Sub -> WebSocket",
 * test purchase appears in feed < 5s): builds a Server-Sent Events byte
 * stream standing in for a real WebSocket push channel. SSE is a genuine
 * one-directional server push over one persistent connection (not
 * client-side polling), and it's buildable entirely on `feed/route.ts`'s
 * existing session/permission auth (`requireOrgPermission`) — apps/api's
 * WebSocket-capable NestJS layer doesn't have a human-session principal
 * wired in yet (see `PermissionGuard`'s own doc comment, KAN-24). Internally
 * the stream still polls Firestore every `pollIntervalMs` (no `onSnapshot`
 * listener exists anywhere in this codebase, and adding one here would be a
 * one-off exception to "no raw Firebase SDK access outside
 * firestore-connection.ts") — the poll interval, not the transport, is this
 * story's buildable-today simplification, the same posture
 * `checkTrackingAlertsForProject`'s own doc comment documents for its own
 * "manual check now" stand-in.
 *
 * Factored out of `feed/route.ts` because a Next.js route file may only
 * export recognized route fields (`GET`, `config`, ...) — a plain named
 * const export like a poll-interval constant fails the build.
 */
export function createWinFeedStream(params: CreateWinFeedStreamParams): ReadableStream<Uint8Array> {
  const { organizationId, projectId, signal } = params;
  const pollIntervalMs = params.pollIntervalMs ?? WIN_FEED_POLL_INTERVAL_MS;
  const maxDurationMs = params.maxDurationMs ?? WIN_FEED_MAX_STREAM_DURATION_MS;
  let cursor = params.since;

  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      function safeEnqueue(chunk: string): void {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }

      safeEnqueue('retry: 2000\n\n');
      const deadline = Date.now() + maxDurationMs;

      while (!closed && !signal.aborted && Date.now() < deadline) {
        try {
          const events = await listWinEventsSince(organizationId, projectId, cursor);
          for (const event of events) {
            safeEnqueue(`event: win\ndata: ${JSON.stringify(toWinEventFeedItem(event))}\n\n`);
            cursor = event.created_at;
          }
          if (events.length === 0) {
            safeEnqueue(': heartbeat\n\n');
          }
        } catch {
          // A transient read failure just skips this poll tick — `cursor` only advances on a
          // successful flush, so the next tick retries the same window and no win is lost.
        }
        await sleep(pollIntervalMs, signal);
      }

      if (!closed) {
        try {
          controller.close();
        } catch {
          // Already closed by the client cancelling.
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
}
