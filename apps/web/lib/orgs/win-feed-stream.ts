import 'server-only';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { listWinEventsSince } from '@/lib/orgs/queries';
import { toWinEventFeedItem } from '@/lib/orgs/win-rule-view';

/** How often the stream re-checks Firestore for new wins — well under the AC's "<5s" budget. */
export const WIN_FEED_POLL_INTERVAL_MS = 1500;

/** Bounds one connection's lifetime so a long-lived TV-mode tab can't hold its poll loop open forever; `EventSource` reconnects automatically, resuming from the `id:` of the last event it saw via the standard `Last-Event-ID` request header — see `feed/route.ts`. */
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
  /** ISO cursor to resume from — everything created at-or-after this is flushed (see `listWinEventsSince`'s own doc comment for why this is inclusive). */
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
 * Every flushed win carries an SSE `id:` line set to its own `created_at`,
 * so a native `EventSource` reconnect automatically resends that value as
 * the `Last-Event-ID` request header — `feed/route.ts` reads it back as the
 * resumed `since` cursor, closing the "reconnect loses whatever fired during
 * the gap" hole a bare `retry:` directive alone would leave. Because
 * `listWinEventsSince` is inclusive of its cursor (two wins can legitimately
 * share one millisecond-resolution `created_at` under concurrent ingest —
 * see that function's own doc comment), `seenIdsAtCursor` tracks which ids
 * at the *current* cursor timestamp have already been flushed on this
 * connection, so a same-timestamp requery doesn't re-send them; it resets
 * whenever the cursor actually advances to a new timestamp. A fresh
 * reconnect starts this set empty, so a win the connection dropped before
 * fully flushing may be resent once rather than lost — duplicate delivery on
 * reconnect is an accepted tradeoff against the alternative of silently
 * dropping a win forever.
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
  let seenIdsAtCursor = new Set<string>();

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
      let terminatedByError = false;

      while (!closed && !terminatedByError && !signal.aborted && Date.now() < deadline) {
        try {
          const events = await listWinEventsSince(organizationId, projectId, cursor);
          let flushedAny = false;
          for (const event of events) {
            if (event.created_at === cursor && seenIdsAtCursor.has(event.id)) {
              continue;
            }
            safeEnqueue(`id: ${event.created_at}\nevent: win\ndata: ${JSON.stringify(toWinEventFeedItem(event))}\n\n`);
            flushedAny = true;
            if (event.created_at === cursor) {
              seenIdsAtCursor.add(event.id);
            } else {
              cursor = event.created_at;
              seenIdsAtCursor = new Set([event.id]);
            }
          }
          if (!flushedAny) {
            safeEnqueue(': heartbeat\n\n');
          }
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            // Terminal — the project is gone (or was never visible to this caller); retrying the
            // same failing query forever would just spin the poll loop for up to `maxDurationMs`.
            // Distinct from `closed` (which means "the controller must not be touched again,
            // the client already cancelled it") — here the controller is still open and must
            // still be closed below, just without waiting out the rest of `maxDurationMs` first.
            terminatedByError = true;
            break;
          }
          // Any other failure is treated as transient and skips this poll tick — `cursor` only
          // advances on a successful flush, so the next tick retries the same window and no win
          // already-confirmed-fired is lost.
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
