import type { BoardTile } from '../models/board.model';
import { createBoard, listBoardsForProject, saveBoardTiles } from '../services/board.service';

/** One board a built-in metric pack seeds on install. `name` is the idempotency key a re-run looks existing boards up by. */
export interface PackDefaultBoard {
  name: string;
  tiles: readonly BoardTile[];
}

export interface EnsurePackDefaultBoardsSeededResult {
  /** Board names newly created by this call. */
  seeded: string[];
  /** Board names this call completed the tiles for — a prior seed attempt created the board (and marked it as this pack's own, via `BoardModel.seeded_by_plugin_id`) but was interrupted before populating its tiles. See this function's own doc comment. */
  repaired: string[];
  /** Board names already fully seeded, or belonging to a human (a board with this exact name this pack didn't create) — left completely untouched either way. */
  alreadyPresent: string[];
}

/**
 * Idempotently seeds a built-in pack's default boards (KAN-61, plan
 * `13 §E11.3`: "New project with pack installed shows populated boards
 * after first sync" — a pack with no sync/run concept treats "after
 * install" as its own "after first sync"). Must run *after* the pack's own
 * metrics are registered — every tile references a metric name that must
 * already be active in the project's catalog, and `saveBoardTiles` rejects
 * a tile naming one that isn't.
 *
 * Shared by every pack that ships default boards (the SaaS metric pack and
 * the landing-page pack, as of this writing) instead of each keeping its
 * own copy of this logic — see each pack's own `default-boards.ts` for the
 * board content itself.
 *
 * A board's own `seeded_by_plugin_id` (set only when *this* function
 * creates it, via `createBoard`'s `seededByPluginId`) is what lets a re-run
 * repair a half-seeded board instead of only ever creating-or-skipping by
 * name:
 * - No board with this name exists yet → create it (tagged with `pluginId`)
 *   and populate its tiles. Reported as `seeded`.
 * - A board with this name exists, tagged as this same pack's own, and
 *   still has zero tiles → `createBoard` succeeded on some earlier call but
 *   the follow-up `saveBoardTiles` never landed (a transient Firestore
 *   error, a process restart between the two writes — they aren't one
 *   transaction). This call completes that interrupted write rather than
 *   leaving the board permanently blank. Reported as `repaired`.
 * - A board with this name exists but is *not* tagged as this pack's own
 *   (a human created it directly, e.g. by renaming their own board to
 *   match) → left completely untouched, tiles and all, regardless of
 *   whether it currently has any. This is the one case a name-only check
 *   can't tell apart from the "interrupted seed" case above, which is
 *   exactly why the tag exists. Reported as `alreadyPresent`.
 * - A board with this name exists, tagged as this pack's own, and already
 *   has tiles → already fully seeded by an earlier call; left untouched.
 *   Also reported as `alreadyPresent`.
 */
export async function ensurePackDefaultBoardsSeeded(
  pluginId: string,
  defaultBoards: readonly PackDefaultBoard[],
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsurePackDefaultBoardsSeededResult> {
  const existingBoards = await listBoardsForProject(organizationId, projectId);
  const existingByName = new Map(existingBoards.map((board) => [board.name, board]));

  const seeded: string[] = [];
  const repaired: string[] = [];
  const alreadyPresent: string[] = [];

  for (const defaultBoard of defaultBoards) {
    const existing = existingByName.get(defaultBoard.name);
    const isRepairableStub = existing !== undefined && existing.seeded_by_plugin_id === pluginId && existing.tiles.length === 0;

    if (existing !== undefined && !isRepairableStub) {
      alreadyPresent.push(defaultBoard.name);
      continue;
    }

    const board = existing ?? (await createBoard({ organizationId, projectId, name: defaultBoard.name, createdByUserId, seededByPluginId: pluginId }));
    await saveBoardTiles({
      organizationId,
      projectId,
      boardId: board.id,
      tiles: [...defaultBoard.tiles],
      updatedByUserId: createdByUserId,
    });

    if (existing !== undefined) {
      repaired.push(defaultBoard.name);
    } else {
      seeded.push(defaultBoard.name);
    }
  }

  return { seeded, repaired, alreadyPresent };
}
