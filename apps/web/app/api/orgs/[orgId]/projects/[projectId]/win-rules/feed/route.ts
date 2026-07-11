import type { NextRequest } from 'next/server';
import { requireOrgPermission } from '@/lib/orgs/access';
import { createWinFeedStream } from '@/lib/orgs/win-feed-stream';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * KAN-65's realtime win feed (AC: "ingest -> Pub/Sub -> WebSocket", test
 * purchase appears in feed < 5s) — see `createWinFeedStream`'s own doc
 * comment (`win-feed-stream.ts`) for why this is a Server-Sent Events stream
 * rather than a literal WebSocket. `?since=<ISO>` resumes from a client's
 * last-seen cursor (an `EventSource` reconnect included) — omitted on a
 * fresh connection, defaulting to "now" so a first-time viewer doesn't get
 * flooded with a project's entire win history.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const sinceParam = request.nextUrl.searchParams.get('since');
  const since = sinceParam && sinceParam.trim().length > 0 ? sinceParam : new Date().toISOString();

  const stream = createWinFeedStream({
    organizationId: orgId,
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
