import { NextResponse, type NextRequest } from 'next/server';
import { InvalidBoardError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { createBoard } from '@/lib/orgs/mutations';
import { listBoardsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseCreateBoardRequestBody } from '@/lib/orgs/parse-board-fields';
import { toBoardSummaryView } from '@/lib/orgs/board-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every board in a project (KAN-60), name-sorted — gated on `dashboards.write`, the same "whole feature, not just mutation, is admin-only" posture every other project admin surface in this codebase uses. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const boards = await listBoardsForProject(orgId, projectId);
    return NextResponse.json({ boards: boards.map(toBoardSummaryView) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Creates an empty board (KAN-60 AC: "build a board ... without code" — tiles are added afterward via the grid editor). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseCreateBoardRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const board = await createBoard({ organizationId: orgId, projectId, name: parsed.name, createdByUserId: user.id });
    return NextResponse.json({ board: toBoardSummaryView(board) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidBoardError) {
      return NextResponse.json({ error: 'invalid_board', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
