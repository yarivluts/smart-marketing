import { NextResponse, type NextRequest } from 'next/server';
import { requireTvViewer } from '@/lib/orgs/tv-viewer-auth';
import { getBoard, listGoalsForProject, queryGoalProgress } from '@/lib/orgs/queries';
import { buildGoalThermometerView, toGoalSummaryView } from '@/lib/orgs/goal-view';

/**
 * The rotation "frame manifest" (KAN-67): every board this TV rotates
 * through (by name — tile data itself is fetched per-frame from `board/
 * route.ts` so a rotation with many boards doesn't pay for every board's
 * query up front) plus every project goal's current thermometer, so the TV
 * can build its full rotation sequence (boards, then a goals frame) client-
 * side. Deliberately not streamed/pushed — the TV refetches this
 * periodically on its own (see `tv-app.tsx`'s own comment on the refresh
 * interval), the same "poll, don't hold a connection open" posture the win
 * feed's `EventSource` reconnect cycle already accepts for its own transport
 * (see `win-feed-stream.ts`'s doc comment) — a goal's progress or a board's
 * name changing mid-rotation only needs to show up eventually, not within
 * the sub-5s budget the win feed itself is held to.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { pairing, organizationId, projectId, error } = await requireTvViewer(request);
  if (error) {
    return error;
  }

  const boardIds = pairing.board_ids ?? [];

  const [boardResults, goals] = await Promise.all([
    Promise.all(boardIds.map((boardId) => getBoard(organizationId, projectId, boardId))),
    listGoalsForProject(organizationId, projectId),
  ]);

  const boards = boardResults
    .map((board, index) => (board ? { id: board.id, name: board.name } : { id: boardIds[index], name: null }))
    .filter((board): board is { id: string; name: string } => board.name !== null);

  const goalFrames = await Promise.all(
    goals.map(async (goal) => {
      const outcome = await queryGoalProgress(organizationId, projectId, goal);
      return { ...toGoalSummaryView(goal), thermometer: buildGoalThermometerView(outcome) };
    }),
  );

  return NextResponse.json({
    label: pairing.label ?? '',
    rotationSeconds: pairing.rotation_seconds ?? 30,
    reducedMotion: pairing.reduced_motion ?? false,
    organizationId,
    projectId,
    boards,
    goals: goalFrames,
  });
}
