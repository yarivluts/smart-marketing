import type { NextRequest } from 'next/server';
import { requireOrgPermission } from '@/lib/orgs/access';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { createWinFeedStream } from '@/lib/orgs/win-feed-stream';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

function firstNonEmpty(value: string | null): string | null {
  return value && value.trim().length > 0 ? value : null;
}

/**
 * KAN-65's realtime win feed (AC: "ingest -> Pub/Sub -> WebSocket", test
 * purchase appears in feed < 5s) — see `createWinFeedStream`'s own doc
 * comment (`win-feed-stream.ts`) for why this is a Server-Sent Events stream
 * rather than a literal WebSocket. The resume cursor is resolved in priority
 * order: the standard `Last-Event-ID` header (a native `EventSource`
 * reconnect sets this automatically to the `id:` of the last event it saw —
 * see `createWinFeedStream`'s own doc comment for why closing this gap
 * matters), then `?since=<ISO>` (a caller-supplied starting point), then
 * "now" so a first-time viewer doesn't get flooded with a project's entire
 * win history. The stream carries the wins of the environment picked in the
 * project shell (KAN-196, the same `gos_env_<projectId>` cookie the page
 * itself was rendered with), `prod` by default.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const lastEventId = request.headers.get('last-event-id');
  const sinceParam = request.nextUrl.searchParams.get('since');
  const since = firstNonEmpty(lastEventId) ?? firstNonEmpty(sinceParam) ?? new Date().toISOString();
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);

  const stream = createWinFeedStream({
    organizationId: orgId,
    projectId,
    since,
    environmentId: selectedEnvironment?.id,
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
