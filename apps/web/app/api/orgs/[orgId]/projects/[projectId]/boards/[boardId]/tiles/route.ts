import { NextResponse, type NextRequest } from 'next/server';
import { BoardNotFoundError, InvalidBoardError } from '@growthos/firebase-orm-models';
import { saveBoardTiles } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseSaveBoardTilesRequestBody } from '@/lib/orgs/parse-board-fields';
import { toBoardView } from '@/lib/orgs/board-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; boardId: string }>;
}

/**
 * Replaces a board's entire tile layout in one write (KAN-60 AC: "layout
 * persists") — the grid editor's "Save layout" action. See
 * `saveBoardTiles`'s own doc comment for why a full-array replace instead of
 * per-tile writes.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, boardId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseSaveBoardTilesRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const board = await saveBoardTiles({ organizationId: orgId, projectId, boardId, tiles: parsed.tiles, updatedByUserId: user.id });
    return NextResponse.json({ board: toBoardView(board) });
  } catch (err) {
    if (err instanceof BoardNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidBoardError) {
      return NextResponse.json({ error: 'invalid_board', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
