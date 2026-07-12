import type { NextRequest } from 'next/server';
import { requireTvViewer } from '@/lib/orgs/tv-viewer-auth';
import { createWinFeedStream } from '@/lib/orgs/win-feed-stream';

function firstNonEmpty(value: string | null): string | null {
  return value && value.trim().length > 0 ? value : null;
}

/**
 * The TV's own live win feed (KAN-67, reusing KAN-65's `createWinFeedStream`
 * as-is — see that function's own doc comment for the SSE-over-WebSocket
 * transport rationale and its `Last-Event-ID` reconnect handling, both of
 * which apply identically here). The only difference from `.../win-rules/
 * feed/route.ts` is the auth boundary: `requireTvViewer`'s device-token
 * check instead of `requireOrgPermission`'s session check.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { organizationId, projectId, error } = await requireTvViewer(request);
  if (error) {
    return error;
  }

  const lastEventId = request.headers.get('last-event-id');
  const sinceParam = request.nextUrl.searchParams.get('since');
  const since = firstNonEmpty(lastEventId) ?? firstNonEmpty(sinceParam) ?? new Date().toISOString();

  const stream = createWinFeedStream({
    organizationId,
    projectId,
    since,
    signal: request.signal,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
