import { NextResponse, type NextRequest } from 'next/server';
import { BoardNotFoundError, InvalidBoardError } from '@growthos/firebase-orm-models';
import { deleteBoard, updateBoardSettings } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateBoardSettingsRequestBody } from '@/lib/orgs/parse-board-fields';
import { toBoardView } from '@/lib/orgs/board-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; boardId: string }>;
}

/** Renames a board and/or updates its board-level date range, compare period, and global filters (KAN-60, plan `10 §2.2`). Every field is optional — only what's sent is changed. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, boardId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateBoardSettingsRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const board = await updateBoardSettings({
      organizationId: orgId,
      projectId,
      boardId,
      updatedByUserId: user.id,
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.dateRange !== undefined ? { dateRange: parsed.dateRange } : {}),
      ...(parsed.compare !== undefined ? { compare: parsed.compare } : {}),
      ...(parsed.globalFilters !== undefined ? { globalFilters: parsed.globalFilters } : {}),
    });
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

/** Deletes a board outright (see `deleteBoard`'s own doc comment for why a board, unlike most lifecycle models in this codebase, has no keep-forever audit requirement). */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, boardId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await deleteBoard(orgId, projectId, boardId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BoardNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
