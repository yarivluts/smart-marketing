import type { BoardTile } from '../../models/board.model';
import { createBoard, listBoardsForProject, saveBoardTiles } from '../../services/board.service';

/** One board this pack seeds on install. `name` is also the idempotency key — see {@link ensureLandingPagePackDefaultBoardsSeeded}. */
export interface LandingPagePackDefaultBoard {
  name: string;
  tiles: readonly BoardTile[];
}

/**
 * The pack's single default board, laid out to answer its one question in
 * reading order: how much traffic is landing at all (line), then the
 * comparison that drives a decision — conversion rate per page (bar), then
 * the same split by campaign, and finally the full table where a human
 * reads the actual numbers per page.
 *
 * The table tile carries both dimensions (`landing_page` + `campaign_id`),
 * which is the literal "several landing pages across several campaigns"
 * grid: one row per page/campaign pair. `big_number` tiles deliberately
 * carry no dimensions (a single total has nothing to break down by — see
 * `BoardTile.dimensions`).
 */
const LANDING_PAGE_BOARD: LandingPagePackDefaultBoard = {
  name: 'Landing page performance',
  tiles: [
    {
      id: 'lp-visitors-line',
      type: 'line',
      title: 'Visitors',
      layout: { x: 0, y: 0, w: 6, h: 4 },
      metricNames: ['lp_visitors'],
      dimensions: [],
    },
    {
      id: 'lp-conversion-rate-big-number',
      type: 'big_number',
      title: 'Conversion rate',
      layout: { x: 6, y: 0, w: 3, h: 4 },
      metricNames: ['lp_conversion_rate'],
      dimensions: [],
    },
    {
      id: 'lp-conversions-big-number',
      type: 'big_number',
      title: 'Conversions',
      layout: { x: 9, y: 0, w: 3, h: 4 },
      metricNames: ['lp_conversions'],
      dimensions: [],
    },
    {
      id: 'lp-conversion-rate-by-page-bar',
      type: 'bar',
      title: 'Conversion rate by landing page',
      layout: { x: 0, y: 4, w: 6, h: 4 },
      metricNames: ['lp_conversion_rate'],
      dimensions: ['landing_page'],
    },
    {
      id: 'lp-conversion-rate-by-campaign-bar',
      type: 'bar',
      title: 'Conversion rate by campaign',
      layout: { x: 6, y: 4, w: 6, h: 4 },
      metricNames: ['lp_conversion_rate'],
      dimensions: ['campaign_id'],
    },
    {
      id: 'lp-by-page-and-campaign-table',
      type: 'table',
      title: 'Landing page x campaign',
      layout: { x: 0, y: 8, w: 12, h: 5 },
      metricNames: ['lp_conversion_rate'],
      dimensions: ['landing_page', 'campaign_id'],
    },
  ],
};

export const LANDING_PAGE_PACK_DEFAULT_BOARDS: readonly LandingPagePackDefaultBoard[] = [LANDING_PAGE_BOARD];

export interface EnsureLandingPagePackDefaultBoardsSeededResult {
  /** Board names newly created by this call. */
  seeded: string[];
  /** Board names a prior call (or a human) already created — not an error. */
  alreadyPresent: string[];
}

/**
 * Idempotently seeds this pack's default board, name-keyed exactly like
 * `ensureSaasMetricPackDefaultBoardsSeeded` (see that function for the
 * shared caveat: a board created but left un-tiled by a mid-way failure is
 * skipped by the name check on a later reinstall). Must run *after* the
 * pack's metrics are registered — `saveBoardTiles` rejects a tile naming a
 * metric that isn't in the project's active catalog.
 */
export async function ensureLandingPagePackDefaultBoardsSeeded(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureLandingPagePackDefaultBoardsSeededResult> {
  const existingBoards = await listBoardsForProject(organizationId, projectId);
  const existingNames = new Set(existingBoards.map((board) => board.name));

  const seeded: string[] = [];
  const alreadyPresent: string[] = [];

  for (const defaultBoard of LANDING_PAGE_PACK_DEFAULT_BOARDS) {
    if (existingNames.has(defaultBoard.name)) {
      alreadyPresent.push(defaultBoard.name);
      continue;
    }
    const board = await createBoard({ organizationId, projectId, name: defaultBoard.name, createdByUserId });
    await saveBoardTiles({
      organizationId,
      projectId,
      boardId: board.id,
      tiles: [...defaultBoard.tiles],
      updatedByUserId: createdByUserId,
    });
    seeded.push(defaultBoard.name);
  }

  return { seeded, alreadyPresent };
}
