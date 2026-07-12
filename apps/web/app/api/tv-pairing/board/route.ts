import { NextResponse, type NextRequest } from 'next/server';
import { requireTvViewer } from '@/lib/orgs/tv-viewer-auth';
import { getBoard, queryBoardTile } from '@/lib/orgs/queries';
import { buildTileRenderView, toBoardView } from '@/lib/orgs/board-view';

/**
 * One rotation frame's worth of board data (KAN-67): the same per-tile
 * `queryBoardTile` -> `buildTileRenderView` composition the board detail
 * page (`boards/[boardId]/page.tsx`) uses, reused as-is so the TV renders
 * with `<BoardTileView>` — the exact same component an admin sees, no
 * TV-specific rendering fork to keep in sync. `boardId` must be one of this
 * pairing's own `board_ids` (set once, at claim time) — a paired TV cannot
 * be redirected into showing an arbitrary board in this project just by
 * guessing its id, the same "the credential itself is the scope, not
 * whatever the caller additionally claims" posture `verifyApiKeyForRequest`
 * documents for its own org/project/environment cross-check.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { pairing, organizationId, projectId, error } = await requireTvViewer(request);
  if (error) {
    return error;
  }

  const boardId = request.nextUrl.searchParams.get('boardId');
  if (!boardId || !(pairing.board_ids ?? []).includes(boardId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const board = await getBoard(organizationId, projectId, boardId);
  if (!board) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const boardView = toBoardView(board);
  const tileOutcomes = await Promise.all(board.tiles.map((tile) => queryBoardTile(organizationId, projectId, board, tile)));
  const tiles = board.tiles.map((tile, index) => ({ tile, view: buildTileRenderView(tile, tileOutcomes[index]) }));

  return NextResponse.json({ id: board.id, name: boardView.name, tiles });
}
