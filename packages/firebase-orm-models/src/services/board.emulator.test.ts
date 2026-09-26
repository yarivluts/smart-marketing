import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANY_COHORT_CONVERSION_EVENT,
  BoardNotFoundError,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  deleteBoard,
  ensureUserForFirebaseSession,
  getBoard,
  InMemoryMetricQueryResultCache,
  InvalidBoardError,
  KNOWN_UNBUILT_WAREHOUSE_TABLES,
  listAuditLogEntriesForOrg,
  listBoardsForProject,
  listEnvironmentsForProject,
  ProjectNotFoundError,
  queryBoardTile,
  queryBoardTiles,
  registerMetricDefinition,
  resolveBoardDateRange,
  migrateSeededBoardsToRelativeDateRange,
  hasUntouchedSeededDefaultDateRange,
  BOARD_DATE_RANGE_MIGRATION_ACTOR_ID,
  saveBoardTiles,
  setProjectCostQuota,
  updateBoardSettings,
  type BoardTile,
  type WarehouseQueryExecutor,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('board-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

async function registerAdSpend(organizationId: string, projectId: string, createdByUserId: string, dimensions: string[] = ['channel']) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'ad_spend',
    definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
    dimensions,
    createdByUserId,
  });
}

async function registerSignups(organizationId: string, projectId: string, createdByUserId: string) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'signups',
    definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
    dimensions: [],
    createdByUserId,
  });
}

/**
 * KAN-62's cohort engine, registered the same way any other `fact_*` table is (see `BOARD_TILE_TYPES`'s own doc comment on `board.model.ts` for why `cohort_month` as `timeColumn` gives a `heatmap` tile its matrix's row axis "for free" via the existing time-bucketing path).
 * Since KAN-118 added a `conversion_event` dimension to `fact_cohort_retention` (one `__any__` row plus one row per specific event label per cohort_month x period_number), any real registration against this table needs a `conversion_event` filter — otherwise `avg(retention_rate)` averages across every event label too, not just the intended one. This mirrors `queryProjectCohortRetention`'s own `ANY_COHORT_CONVERSION_EVENT` default.
 */
async function registerCohortRetention(organizationId: string, projectId: string, createdByUserId: string, dimensions: string[] = ['period_number']) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'cohort_retention_rate',
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'avg',
        table: 'fact_cohort_retention',
        column: 'retention_rate',
        timeColumn: 'cohort_month',
        filters: [{ field: 'conversion_event', operator: '=', value: ANY_COHORT_CONVERSION_EVENT }],
      },
    },
    dimensions,
    createdByUserId,
  });
}

function bigNumberTile(overrides: Partial<BoardTile> = {}): BoardTile {
  return {
    id: unique('tile'),
    type: 'big_number',
    title: 'Ad spend',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    metricNames: ['ad_spend'],
    dimensions: [],
    ...overrides,
  };
}

function heatmapTile(overrides: Partial<BoardTile> = {}): BoardTile {
  return {
    id: unique('tile'),
    type: 'heatmap',
    title: 'Cohort retention',
    layout: { x: 0, y: 0, w: 6, h: 4 },
    metricNames: ['cohort_retention_rate'],
    dimensions: ['period_number'],
    ...overrides,
  };
}

/** KAN-63's engagement-depth histogram, registered the same way any other `fact_*` table is (see `BOARD_TILE_TYPES`'s own doc comment on `board.model.ts` for why a `histogram` tile needs no grain constraint, unlike `heatmap`). */
async function registerEngagementDepthHistogram(organizationId: string, projectId: string, createdByUserId: string, dimensions: string[] = ['days_active_bucket']) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'engagement_depth_histogram',
    definition: {
      kind: 'aggregation',
      aggregation: { function: 'sum', table: 'fact_engagement_depth_histogram', column: 'customer_count', timeColumn: 'as_of_date', filters: [] },
    },
    dimensions,
    createdByUserId,
  });
}

function histogramTile(overrides: Partial<BoardTile> = {}): BoardTile {
  return {
    id: unique('tile'),
    type: 'histogram',
    title: 'Engagement depth',
    layout: { x: 0, y: 0, w: 6, h: 4 },
    metricNames: ['engagement_depth_histogram'],
    dimensions: ['days_active_bucket'],
    ...overrides,
  };
}

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

describe('createBoard', () => {
  it('creates an empty board with a default rolling last-30-days date range (KAN-211)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Create Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    expect(board.name).toBe('Marketing');
    expect(board.tiles).toEqual([]);
    expect(board.global_filters).toEqual([]);
    expect(board.compare).toBeNull();
    // Stored as a preset, not frozen dates - so it still means "the last 30 days" a month later.
    const reloaded = await getBoard(organization.id, project.id, board.id);
    expect(reloaded?.date_range).toEqual({ kind: 'relative', preset: 'last_30_days', grain: 'day' });
    expect(resolveBoardDateRange(board.date_range, '2026-08-27')).toEqual({ start: '2026-07-29', end: '2026-08-27', grain: 'day' });
    expect(resolveBoardDateRange(board.date_range, '2026-09-26')).toEqual({ start: '2026-08-28', end: '2026-09-26', grain: 'day' });
    expect(board.created_by).toBe(owner.id);
    expect(board.seeded_by_plugin_id).toBeNull();
  });

  it('tags a board with the seeding pack\'s plugin id when one is given', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Seeded Tag Org');
    const board = await createBoard({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Marketing',
      createdByUserId: owner.id,
      seededByPluginId: 'com.growthos.example-pack',
    });

    expect(board.seeded_by_plugin_id).toBe('com.growthos.example-pack');
  });

  it('rejects an empty name', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Empty Name Org');
    await expect(
      createBoard({ organizationId: organization.id, projectId: project.id, name: '   ', createdByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('rejects a project that does not belong to this org', async () => {
    const { owner, organization } = await setupOrgWithProject('Board Bad Project Org');
    await expect(
      createBoard({ organizationId: organization.id, projectId: 'does-not-exist', name: 'X', createdByUserId: owner.id }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe('listBoardsForProject / getBoard', () => {
  it('lists a project’s boards name-sorted and isolates from a sibling project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board List Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });

    await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Zeta', createdByUserId: owner.id });
    await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Alpha', createdByUserId: owner.id });
    await createBoard({ organizationId: organization.id, projectId: otherProject.id, name: 'Sibling', createdByUserId: owner.id });

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('returns null for a board id that does not exist, or belongs to a different org/project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Get Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Board Get Other Org');

    expect(await getBoard(organization.id, project.id, 'does-not-exist')).toBeNull();
    expect(await getBoard(otherOrg.id, project.id, board.id)).toBeNull();
    expect(await getBoard(organization.id, otherProject.id, board.id)).toBeNull();
    expect((await getBoard(organization.id, project.id, board.id))?.id).toBe(board.id);
  });
});

describe('updateBoardSettings', () => {
  it('updates only the fields provided, leaving the rest untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Settings Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    const originalDateRange = board.date_range;

    const renamed = await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: board.id,
      name: 'Revenue',
      updatedByUserId: owner.id,
    });
    expect(renamed.name).toBe('Revenue');
    expect(renamed.date_range).toEqual(originalDateRange);

    const withFilters = await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: board.id,
      dateRange: { start: '2026-01-01', end: '2026-01-31', grain: 'day' },
      compare: 'previous_period',
      globalFilters: [{ field: 'channel', operator: '=', value: 'google' }],
      updatedByUserId: owner.id,
    });
    expect(withFilters.date_range).toEqual({ kind: 'absolute', start: '2026-01-01', end: '2026-01-31', grain: 'day' });
    expect(withFilters.compare).toBe('previous_period');
    expect(withFilters.global_filters).toEqual([{ field: 'channel', operator: '=', value: 'google' }]);
    expect(withFilters.name).toBe('Revenue');

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.filter((entry) => entry.action === 'board.settings_update' && entry.target_id === board.id)).toHaveLength(2);
  });

  it('clears compare when explicitly set to null, and rejects an inverted date range', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Settings Clear Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: board.id,
      compare: 'previous_year',
      updatedByUserId: owner.id,
    });
    const cleared = await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: board.id,
      compare: null,
      updatedByUserId: owner.id,
    });
    expect(cleared.compare).toBeNull();

    // Reloads from Firestore rather than trusting the in-memory returned
    // instance — `updateDoc()` omits any field assigned `undefined` from
    // its write, silently leaving a previous value in place; this only
    // catches that class of bug by reading the persisted document back.
    const reloaded = await getBoard(organization.id, project.id, board.id);
    expect(reloaded?.compare).toBeNull();

    await expect(
      updateBoardSettings({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        dateRange: { start: '2026-02-01', end: '2026-01-01', grain: 'day' },
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('throws BoardNotFoundError for a board id that does not exist', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Settings Missing Org');
    await expect(
      updateBoardSettings({ organizationId: organization.id, projectId: project.id, boardId: 'nope', name: 'X', updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(BoardNotFoundError);
  });
});

describe('saveBoardTiles', () => {
  it('persists a valid tile layout (KAN-60 AC: layout persists)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Tiles Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    const tiles = [bigNumberTile({ dimensions: ['channel'] })];
    const saved = await saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles, updatedByUserId: owner.id });
    expect(saved.tiles).toEqual(tiles);

    const reloaded = await getBoard(organization.id, project.id, board.id);
    expect(reloaded?.tiles).toEqual(tiles);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'board.tiles_save' && entry.target_id === board.id)).toBe(true);
  });

  it('accepts a funnel tile with two or more ordered metric steps', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Funnel Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    await registerSignups(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Funnel', createdByUserId: owner.id });

    const tiles: BoardTile[] = [
      { id: unique('tile'), type: 'funnel', title: 'Acquisition', layout: { x: 0, y: 0, w: 6, h: 4 }, metricNames: ['ad_spend', 'signups'], dimensions: [] },
    ];
    const saved = await saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles, updatedByUserId: owner.id });
    expect(saved.tiles[0].metricNames).toEqual(['ad_spend', 'signups']);
  });

  it('rejects a funnel tile with fewer than two steps', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Funnel Invalid Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Funnel', createdByUserId: owner.id });

    const tiles: BoardTile[] = [
      { id: unique('tile'), type: 'funnel', title: 'Acquisition', layout: { x: 0, y: 0, w: 6, h: 4 }, metricNames: ['ad_spend'], dimensions: [] },
    ];
    await expect(
      saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles, updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('rejects a non-funnel tile with zero or more than one metric', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Non Funnel Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    await registerSignups(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [bigNumberTile({ metricNames: [] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [bigNumberTile({ metricNames: ['ad_spend', 'signups'] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('accepts a heatmap tile with exactly one dimension on a month-grain board, and rejects one with zero or more than one', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Heatmap Org');
    await registerCohortRetention(organization.id, project.id, owner.id, ['period_number', 'cohort_size']);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Cohorts', createdByUserId: owner.id });
    await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: board.id,
      dateRange: { ...board.date_range, grain: 'month' },
      updatedByUserId: owner.id,
    });

    const saved = await saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles: [heatmapTile()], updatedByUserId: owner.id });
    expect(saved.tiles[0].dimensions).toEqual(['period_number']);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [heatmapTile({ dimensions: [] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [heatmapTile({ dimensions: ['period_number', 'cohort_size'] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('rejects a heatmap tile on a board whose date-range grain is not "month"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Heatmap Grain Org');
    await registerCohortRetention(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Cohorts', createdByUserId: owner.id });
    expect(resolveBoardDateRange(board.date_range).grain).toBe('day');

    await expect(
      saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles: [heatmapTile()], updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('rejects changing a heatmap-carrying board’s grain away from "month"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Heatmap Settings Org');
    await registerCohortRetention(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Cohorts', createdByUserId: owner.id });
    await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: board.id,
      dateRange: { ...board.date_range, grain: 'month' },
      updatedByUserId: owner.id,
    });
    await saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles: [heatmapTile()], updatedByUserId: owner.id });

    await expect(
      updateBoardSettings({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        dateRange: { ...board.date_range, grain: 'day' },
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('accepts a histogram tile with exactly one dimension, and rejects one with zero or more than one — no grain constraint unlike heatmap', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Histogram Org');
    await registerEngagementDepthHistogram(organization.id, project.id, owner.id, ['days_active_bucket']);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Engagement', createdByUserId: owner.id });
    expect(resolveBoardDateRange(board.date_range).grain).toBe('day');

    const saved = await saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles: [histogramTile()], updatedByUserId: owner.id });
    expect(saved.tiles[0].dimensions).toEqual(['days_active_bucket']);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [histogramTile({ dimensions: [] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('rejects duplicate tile ids, an unknown tile type, and a layout that overflows the grid', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Invalid Layout Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    const dup = bigNumberTile();
    await expect(
      saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: board.id, tiles: [dup, { ...dup }], updatedByUserId: owner.id }),
    ).rejects.toBeInstanceOf(InvalidBoardError);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [bigNumberTile({ type: 'pie' as BoardTile['type'] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [bigNumberTile({ layout: { x: 10, y: 0, w: 6, h: 2 } })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('rejects a tile referencing an unregistered metric, or a dimension its metric does not declare', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Unknown Metric Org');
    await registerAdSpend(organization.id, project.id, owner.id, []);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [bigNumberTile({ metricNames: ['does_not_exist'] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);

    await expect(
      saveBoardTiles({
        organizationId: organization.id,
        projectId: project.id,
        boardId: board.id,
        tiles: [bigNumberTile({ dimensions: ['channel'] })],
        updatedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
  });
});

describe('deleteBoard', () => {
  it('deletes a board so it is no longer gettable or listed', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Delete Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    await deleteBoard(organization.id, project.id, board.id, owner.id);

    expect(await getBoard(organization.id, project.id, board.id)).toBeNull();
    expect(await listBoardsForProject(organization.id, project.id)).toEqual([]);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'board.delete' && entry.target_id === board.id)).toBe(true);
  });

  it('throws BoardNotFoundError for a board that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Delete Missing Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Board Delete Other Org');
    const board = await createBoard({ organizationId: otherOrg.id, projectId: otherProject.id, name: 'Marketing', createdByUserId: owner.id });

    await expect(deleteBoard(organization.id, project.id, board.id, owner.id)).rejects.toBeInstanceOf(BoardNotFoundError);
  });
});

describe('queryBoardTile', () => {
  it('returns the executor’s series for a big_number tile', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    const rows: WarehouseRow[] = [{ bucket_date: resolveBoardDateRange(board.date_range).start, ad_spend: 100 }];
    const executor = new FakeWarehouseQueryExecutor(rows);

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile(),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome).toEqual({ ok: true, series: rows });
    expect(executor.callCount).toBe(1);
  });

  it('degrades to a "warehouse not configured" outcome instead of throwing, using the default executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Unconfigured Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile(),
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('warehouse_not_configured');
  });

  it('degrades to a "quota exceeded" outcome once the project’s daily quota is spent', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Quota Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    // A second, distinct metric — the quota test needs two independent metrics (the first call
    // spends the quota, the second must be a genuinely different query to prove the *project's*
    // quota, not a per-metric cache, is what's exhausted).
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'landing_page_views',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_landing_page_performance', timeColumn: 'activity_date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });

    const first = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ metricNames: ['ad_spend'] }),
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: resolveBoardDateRange(board.date_range).start, ad_spend: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(first.ok).toBe(true);

    const second = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ metricNames: ['landing_page_views'], title: 'Landing page views' }),
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: resolveBoardDateRange(board.date_range).start, landing_page_views: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('quota_exceeded');
  });

  it('degrades to a "not yet backed" outcome for a metric targeting a known-unbuilt table, without touching the executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Unbuilt Table Org');
    // `KNOWN_UNBUILT_WAREHOUSE_TABLES` is empty today (everything it used to list, including
    // `fact_funnel_event` — see the next test — now has a real dbt core model, 2026-08-21 KAN-59
    // follow-up), so this test exercises the generic mechanism against a table added just for it.
    const fixtureOnlyUnbuiltTable = 'fixture_only_unbuilt_table_for_test';
    KNOWN_UNBUILT_WAREHOUSE_TABLES.add(fixtureOnlyUnbuiltTable);
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: fixtureOnlyUnbuiltTable, timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Funnel', createdByUserId: owner.id });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: resolveBoardDateRange(board.date_range).start, signups: 1 }]);

    try {
      const outcome = await queryBoardTile({
        organizationId: organization.id,
        projectId: project.id,
        board,
        tile: bigNumberTile({ metricNames: ['signups'], title: 'Signups' }),
        executor,
        cache: new InMemoryMetricQueryResultCache(),
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toBe('not_yet_backed');
      expect(executor.callCount).toBe(0);
    } finally {
      KNOWN_UNBUILT_WAREHOUSE_TABLES.delete(fixtureOnlyUnbuiltTable);
    }
  });

  it('succeeds for signups (fact_funnel_event) now that a real core model backs it (2026-08-21 KAN-59 follow-up)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Funnel Event Now Real Org');
    await registerSignups(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Funnel', createdByUserId: owner.id });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: resolveBoardDateRange(board.date_range).start, signups: 1 }]);

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ metricNames: ['signups'], title: 'Signups' }),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok).toBe(true);
    expect(executor.callCount).toBe(1);
  });

  it('returns a cohort_month x period_number matrix series for a heatmap tile, ignoring any board-level compare', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Heatmap Query Org');
    await registerCohortRetention(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Cohorts', createdByUserId: owner.id });
    await updateBoardSettings({ organizationId: organization.id, projectId: project.id, boardId: board.id, compare: 'previous_period', updatedByUserId: owner.id });
    const reloaded = await getBoard(organization.id, project.id, board.id);
    const rows: WarehouseRow[] = [
      { bucket_date: '2026-01-01', period_number: '0', cohort_retention_rate: 1 },
      { bucket_date: '2026-01-01', period_number: '1', cohort_retention_rate: 0.5 },
    ];
    class RecordingWarehouseQueryExecutor implements WarehouseQueryExecutor {
      public lastQuery: { sql: string } | undefined;
      execute(query: { sql: string }): Promise<WarehouseRow[]> {
        this.lastQuery = query;
        return Promise.resolve(rows);
      }
    }
    const executor = new RecordingWarehouseQueryExecutor();

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board: reloaded!,
      tile: heatmapTile(),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome).toEqual({ ok: true, series: rows });
    // Proves `compare` (`previous_period`, set on the board above) was
    // genuinely excluded from the compiled query, not just that this fake's
    // canned response ignores whatever it received — a real
    // `WarehouseQueryExecutor` would run whatever SQL it's handed, so a
    // heatmap tile silently compiling in a `period` column and `UNION ALL`
    // anyway (harmless against this fake, wrong against a real warehouse)
    // would slip past an assertion on `outcome` alone.
    expect(executor.lastQuery?.sql).not.toContain('UNION ALL');
    expect(executor.lastQuery?.sql).not.toContain('AS period');
  });

  it('returns a days_active_bucket series for a histogram tile, ignoring any board-level compare', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Histogram Query Org');
    await registerEngagementDepthHistogram(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Engagement', createdByUserId: owner.id });
    await updateBoardSettings({ organizationId: organization.id, projectId: project.id, boardId: board.id, compare: 'previous_period', updatedByUserId: owner.id });
    const reloaded = await getBoard(organization.id, project.id, board.id);
    const rows: WarehouseRow[] = [
      { bucket_date: '2026-04-28', days_active_bucket: '1', engagement_depth_histogram: 1 },
      { bucket_date: '2026-04-28', days_active_bucket: '10', engagement_depth_histogram: 1 },
    ];
    class RecordingWarehouseQueryExecutor implements WarehouseQueryExecutor {
      public lastQuery: { sql: string } | undefined;
      execute(query: { sql: string }): Promise<WarehouseRow[]> {
        this.lastQuery = query;
        return Promise.resolve(rows);
      }
    }
    const executor = new RecordingWarehouseQueryExecutor();

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board: reloaded!,
      tile: histogramTile(),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome).toEqual({ ok: true, series: rows });
    // Same "prove compare was genuinely excluded from the compiled SQL, not
    // just that this fake ignores whatever it received" reasoning the
    // heatmap query test's own comment gives.
    expect(executor.lastQuery?.sql).not.toContain('UNION ALL');
    expect(executor.lastQuery?.sql).not.toContain('AS period');
  });

  it('widens a histogram tile’s query start far below the board’s own date range, so a narrow board range can never filter out the one-row-per-project snapshot', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Histogram Time Range Org');
    await registerEngagementDepthHistogram(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Engagement', createdByUserId: owner.id });
    // The board's own default range is a trailing 30 days — deliberately far
    // narrower than the fixed floor a histogram tile's query should widen to,
    // proving the widening isn't merely "whatever the board already covers".
    expect(resolveBoardDateRange(board.date_range).start > '1970-01-01').toBe(true);

    class RecordingWarehouseQueryExecutor implements WarehouseQueryExecutor {
      public lastQuery: { sql: string; params: Record<string, unknown> } | undefined;
      execute(query: { sql: string; params: Record<string, unknown> }): Promise<WarehouseRow[]> {
        this.lastQuery = query;
        return Promise.resolve([]);
      }
    }
    const executor = new RecordingWarehouseQueryExecutor();

    await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: histogramTile(),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(executor.lastQuery?.params.time_start_current).toBe('1970-01-01');
    expect(executor.lastQuery?.params.time_end_current).toBe(resolveBoardDateRange(board.date_range).end);
  });

  it('rethrows a genuinely unexpected executor error rather than degrading it to a generic outcome', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Unexpected Error Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    class ThrowingWarehouseQueryExecutor implements WarehouseQueryExecutor {
      execute(): Promise<WarehouseRow[]> {
        return Promise.reject(new TypeError('boom — a real bug, not an expected failure mode'));
      }
    }

    await expect(
      queryBoardTile({
        organizationId: organization.id,
        projectId: project.id,
        board,
        tile: bigNumberTile(),
        executor: new ThrowingWarehouseQueryExecutor(),
        cache: new InMemoryMetricQueryResultCache(),
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('queryBoardTiles', () => {
  it('returns every tile\'s outcome, in board.tiles order, identical to what calling queryBoardTile per-tile would produce (board-tile-N+1 fix)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Batched Query Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    await registerSignups(organization.id, project.id, owner.id);
    const adSpendTile = bigNumberTile({ metricNames: ['ad_spend'], title: 'Ad spend' });
    const signupsTile = bigNumberTile({ metricNames: ['signups'], title: 'Signups' });
    const created = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    await saveBoardTiles({ organizationId: organization.id, projectId: project.id, boardId: created.id, tiles: [adSpendTile, signupsTile], updatedByUserId: owner.id });
    const board = (await getBoard(organization.id, project.id, created.id))!;

    class PerMetricExecutor implements WarehouseQueryExecutor {
      callCount = 0;
      execute(query: { sql: string }): Promise<WarehouseRow[]> {
        this.callCount += 1;
        if (query.sql.includes('ad_spend')) {
          return Promise.resolve([{ bucket_date: resolveBoardDateRange(board.date_range).start, ad_spend: 42 }]);
        }
        return Promise.resolve([{ bucket_date: resolveBoardDateRange(board.date_range).start, signups: 7 }]);
      }
    }

    const batchedExecutor = new PerMetricExecutor();
    const batchedOutcomes = await queryBoardTiles({
      organizationId: organization.id,
      projectId: project.id,
      board,
      executor: batchedExecutor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    const individualExecutor = new PerMetricExecutor();
    const individualOutcomes = await Promise.all(
      board.tiles.map((tile) =>
        queryBoardTile({ organizationId: organization.id, projectId: project.id, board, tile, executor: individualExecutor, cache: new InMemoryMetricQueryResultCache() }),
      ),
    );

    expect(batchedOutcomes).toEqual(individualOutcomes);
    expect(batchedOutcomes).toEqual([
      { ok: true, series: [{ bucket_date: resolveBoardDateRange(board.date_range).start, ad_spend: 42 }] },
      { ok: true, series: [{ bucket_date: resolveBoardDateRange(board.date_range).start, signups: 7 }] },
    ]);
    expect(batchedExecutor.callCount).toBe(2);
  });

  it('applies the project\'s real quota config to every tile in a batched call (board-tile-N+1 fix)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Batched Quota Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    await registerSignups(organization.id, project.id, owner.id);
    const created = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    await saveBoardTiles({
      organizationId: organization.id,
      projectId: project.id,
      boardId: created.id,
      tiles: [bigNumberTile({ metricNames: ['ad_spend'], title: 'Ad spend' }), bigNumberTile({ metricNames: ['signups'], title: 'Signups' })],
      updatedByUserId: owner.id,
    });
    const board = (await getBoard(organization.id, project.id, created.id))!;
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    // Spends the day's one-attempt quota with its own, already-awaited call
    // (a distinct metric, so it's a genuine cache miss) *before* the batched
    // call below runs — this makes the assertion deterministic. The two
    // tiles inside one `queryBoardTiles` call still run concurrently
    // (`Promise.all` internally, same as the old per-tile fan-out), so
    // whether *they* race each other for the last slot isn't this test's
    // concern; `queryBoardTile`'s own sequential quota test above already
    // covers that. What this test isolates is that the project's real quota
    // *config* — spent to zero remaining attempts before either tile in this
    // call even starts — is genuinely read and applied to both tiles, not
    // silently bypassed (e.g. by an unthreaded precompute always reporting
    // the generous, never-configured default).
    await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ metricNames: ['ad_spend'], title: 'Ad spend' }),
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: resolveBoardDateRange(board.date_range).start, ad_spend: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });

    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: resolveBoardDateRange(board.date_range).start, ad_spend: 1, signups: 1 }]);
    const outcomes = await queryBoardTiles({
      organizationId: organization.id,
      projectId: project.id,
      board,
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcomes.every((outcome) => !outcome.ok && outcome.reason === 'quota_exceeded')).toBe(true);
    expect(executor.callCount).toBe(0);
  });

  it('rejects an unknown project id, the same as every other project-scoped lookup in this file', async () => {
    const { organization } = await setupOrgWithProject('Board Batched No Project Org');

    await expect(
      queryBoardTiles({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        board: { date_range: { start: '2026-01-01', end: '2026-01-07', grain: 'day' }, compare: null, global_filters: [], tiles: [] },
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });
});

describe('queryBoardTiles environment scoping (KAN-196)', () => {
  it('queries every tile against the prod environment by default and against a caller-passed environment when one is given', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Env Scope Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    await registerSignups(organization.id, project.id, owner.id);
    const created = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    await saveBoardTiles({
      organizationId: organization.id,
      projectId: project.id,
      boardId: created.id,
      tiles: [bigNumberTile({ metricNames: ['ad_spend'], title: 'Ad spend' }), bigNumberTile({ metricNames: ['signups'], title: 'Signups' })],
      updatedByUserId: owner.id,
    });
    const board = (await getBoard(organization.id, project.id, created.id))!;
    const environments = await listEnvironmentsForProject(organization.id, project.id);
    const prodEnv = environments.find((environment) => environment.name === 'prod')!;
    const stagingEnv = environments.find((environment) => environment.name === 'staging')!;

    const capturedEnvironmentIds: unknown[] = [];
    const executor: WarehouseQueryExecutor = {
      execute: (query) => {
        capturedEnvironmentIds.push(query.params.tenant_environment_id);
        return Promise.resolve([]);
      },
    };

    await queryBoardTiles({ organizationId: organization.id, projectId: project.id, board, executor, cache: new InMemoryMetricQueryResultCache() });
    expect(capturedEnvironmentIds).toEqual([prodEnv.id, prodEnv.id]);

    capturedEnvironmentIds.length = 0;
    await queryBoardTiles({ organizationId: organization.id, projectId: project.id, board, executor, cache: new InMemoryMetricQueryResultCache(), environmentId: stagingEnv.id });
    expect(capturedEnvironmentIds).toEqual([stagingEnv.id, stagingEnv.id]);
  });
});

describe('relative board date ranges (KAN-211)', () => {
  it('updateBoardSettings stores a relative preset, and switching kinds leaves no stale fields behind', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Relative Settings Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    const base = { organizationId: organization.id, projectId: project.id, boardId: board.id, updatedByUserId: owner.id };

    await updateBoardSettings({ ...base, dateRange: { kind: 'absolute', start: '2026-01-01', end: '2026-01-31', grain: 'week' } });
    expect((await getBoard(organization.id, project.id, board.id))?.date_range).toEqual({ kind: 'absolute', start: '2026-01-01', end: '2026-01-31', grain: 'week' });

    await updateBoardSettings({ ...base, dateRange: { kind: 'relative', preset: 'last_7_days', grain: 'day' } });
    // Read back from Firestore: an update that merged maps would leave the old start/end in place.
    expect((await getBoard(organization.id, project.id, board.id))?.date_range).toEqual({ kind: 'relative', preset: 'last_7_days', grain: 'day' });

    await updateBoardSettings({ ...base, dateRange: { start: '2026-03-01', end: '2026-03-31', grain: 'month' } });
    expect((await getBoard(organization.id, project.id, board.id))?.date_range).toEqual({ kind: 'absolute', start: '2026-03-01', end: '2026-03-31', grain: 'month' });
  });

  it('rejects an unknown preset and a date that is not a real YYYY-MM-DD', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Relative Invalid Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    const base = { organizationId: organization.id, projectId: project.id, boardId: board.id, updatedByUserId: owner.id };

    await expect(
      updateBoardSettings({ ...base, dateRange: { kind: 'relative', preset: 'last_2_days' as never, grain: 'day' } }),
    ).rejects.toBeInstanceOf(InvalidBoardError);
    await expect(updateBoardSettings({ ...base, dateRange: { start: '2026-02-30', end: '2026-03-01', grain: 'day' } })).rejects.toBeInstanceOf(InvalidBoardError);
  });

  it('reads a legacy { start, end, grain } board (no kind) as the absolute range it always was', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Legacy Range Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const created = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Legacy', createdByUserId: owner.id });
    const stored = (await getBoard(organization.id, project.id, created.id))!;
    stored.date_range = { start: '2026-08-01', end: '2026-08-27', grain: 'day' };
    await stored.save();

    const board = (await getBoard(organization.id, project.id, created.id))!;
    expect(board.date_range).toEqual({ start: '2026-08-01', end: '2026-08-27', grain: 'day' });
    expect(resolveBoardDateRange(board.date_range, '2026-09-26')).toEqual({ start: '2026-08-01', end: '2026-08-27', grain: 'day' });

    let captured: Record<string, unknown> = {};
    const executor: WarehouseQueryExecutor = {
      execute: (query) => {
        captured = query.params;
        return Promise.resolve([]);
      },
    };
    await queryBoardTile({ organizationId: organization.id, projectId: project.id, board, tile: bigNumberTile(), executor, cache: new InMemoryMetricQueryResultCache(), today: '2026-09-26' });
    expect(captured.time_start_current).toBe('2026-08-01');
    expect(captured.time_end_current).toBe('2026-08-27');
  });

  it('resolves a relative range at query time, and compares it against the resolved previous period', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Relative Query Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const created = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    await updateBoardSettings({
      organizationId: organization.id,
      projectId: project.id,
      boardId: created.id,
      dateRange: { kind: 'relative', preset: 'last_7_days', grain: 'day' },
      compare: 'previous_period',
      updatedByUserId: owner.id,
    });
    const board = (await getBoard(organization.id, project.id, created.id))!;

    const capturedParams: Record<string, unknown>[] = [];
    const executor: WarehouseQueryExecutor = {
      execute: (query) => {
        capturedParams.push(query.params);
        return Promise.resolve([]);
      },
    };
    await queryBoardTile({ organizationId: organization.id, projectId: project.id, board, tile: bigNumberTile(), executor, cache: new InMemoryMetricQueryResultCache(), today: '2026-09-26' });
    await queryBoardTiles({
      organizationId: organization.id,
      projectId: project.id,
      board: { date_range: board.date_range, compare: board.compare, global_filters: board.global_filters, tiles: [bigNumberTile()] },
      executor,
      cache: new InMemoryMetricQueryResultCache(),
      today: '2026-10-26',
    });

    expect(capturedParams[0]).toMatchObject({
      time_start_current: '2026-09-20',
      time_end_current: '2026-09-26',
      time_start_previous: '2026-09-13',
      time_end_previous: '2026-09-19',
    });
    // A month later the same stored board reads a month later - it rolls forward on its own.
    expect(capturedParams[1]).toMatchObject({ time_start_current: '2026-10-20', time_end_current: '2026-10-26' });
  });
});

describe('queryBoardTile empty-bucket fill (KAN-210 follow-up)', () => {
  async function boardOverWeek(orgName: string) {
    const setup = await setupOrgWithProject(orgName);
    const created = await createBoard({ organizationId: setup.organization.id, projectId: setup.project.id, name: 'Marketing', createdByUserId: setup.owner.id });
    await updateBoardSettings({
      organizationId: setup.organization.id,
      projectId: setup.project.id,
      boardId: created.id,
      dateRange: { start: '2026-09-19', end: '2026-09-25', grain: 'day' },
      updatedByUserId: setup.owner.id,
    });
    const board = (await getBoard(setup.organization.id, setup.project.id, created.id))!;
    return { ...setup, board };
  }

  it('a line tile over a count metric gets a 0 for every day without events', async () => {
    const { owner, organization, project, board } = await boardOverWeek('Board Fill Count Org');
    await registerSignups(organization.id, project.id, owner.id);
    const executor = new FakeWarehouseQueryExecutor([
      { bucket_date: '2026-09-19', signups: 2 },
      { bucket_date: '2026-09-25', signups: 4 },
    ]);

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ type: 'line', metricNames: ['signups'], title: 'Signups' }),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok && outcome.series.map((row) => [row.bucket_date, row.signups])).toEqual([
      ['2026-09-19', 2],
      ['2026-09-20', 0],
      ['2026-09-21', 0],
      ['2026-09-22', 0],
      ['2026-09-23', 0],
      ['2026-09-24', 0],
      ['2026-09-25', 4],
    ]);
  });

  it('a bar tile over an avg metric gets null (a gap) for a day without events, never 0', async () => {
    const { owner, organization, project, board } = await boardOverWeek('Board Fill Avg Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'avg_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'avg', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const executor = new FakeWarehouseQueryExecutor([{ bucket_date: '2026-09-24', avg_spend: 10 }]);

    const outcome = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ type: 'bar', metricNames: ['avg_spend'], title: 'Average spend' }),
      executor,
      cache: new InMemoryMetricQueryResultCache(),
    });

    expect(outcome.ok && outcome.series).toHaveLength(7);
    expect(outcome.ok && outcome.series.filter((row) => row.avg_spend === null)).toHaveLength(6);
    expect(outcome.ok && outcome.series.find((row) => row.bucket_date === '2026-09-24')?.avg_spend).toBe(10);
  });

  it('a table tile and a query with no rows at all are left as the warehouse returned them', async () => {
    const { owner, organization, project, board } = await boardOverWeek('Board Fill Table Org');
    await registerSignups(organization.id, project.id, owner.id);
    const rows: WarehouseRow[] = [{ bucket_date: '2026-09-19', signups: 2 }];

    const table = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ type: 'table', metricNames: ['signups'], title: 'Signups' }),
      executor: new FakeWarehouseQueryExecutor(rows),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(table).toEqual({ ok: true, series: rows });

    const empty = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ type: 'line', metricNames: ['signups'], title: 'Signups' }),
      executor: new FakeWarehouseQueryExecutor([]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(empty).toEqual({ ok: true, series: [] });
  });
});

describe('migrateSeededBoardsToRelativeDateRange (KAN-211)', () => {
  /** Recreates a board exactly as pre-KAN-211 seeding left it: frozen dates computed on its creation day. */
  async function legacyBoard(
    organizationId: string,
    projectId: string,
    ownerId: string,
    name: string,
    seededByPluginId: string | undefined,
    dateRange: { start: string; end: string; grain: 'day' | 'week' },
  ) {
    const created = await createBoard({ organizationId, projectId, name, createdByUserId: ownerId, ...(seededByPluginId ? { seededByPluginId } : {}) });
    const stored = (await getBoard(organizationId, projectId, created.id))!;
    stored.date_range = dateRange;
    stored.created_at = '2026-08-27T10:15:00.000Z';
    await stored.save();
    return stored;
  }

  it('switches only untouched pack-seeded boards, is idempotent, and supports a dry run', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Migration Org');
    const frozen = { start: '2026-07-29', end: '2026-08-27', grain: 'day' as const };
    const seeded = await legacyBoard(organization.id, project.id, owner.id, 'Landing page performance', 'com.growthos.landing-page-pack', frozen);
    const human = await legacyBoard(organization.id, project.id, owner.id, 'My board', undefined, frozen);
    const customized = await legacyBoard(organization.id, project.id, owner.id, 'Seeded but re-dated', 'com.growthos.landing-page-pack', {
      start: '2026-06-01',
      end: '2026-06-30',
      grain: 'day',
    });
    const regrained = await legacyBoard(organization.id, project.id, owner.id, 'Seeded but weekly', 'com.growthos.landing-page-pack', { ...frozen, grain: 'week' });
    const updatedByBefore = seeded.updated_by;

    const dryRun = await migrateSeededBoardsToRelativeDateRange({ organizationId: organization.id, dryRun: true });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.scanned).toBe(4);
    expect(dryRun.migrated.map((ref) => ref.boardId)).toEqual([seeded.id]);
    expect((await getBoard(organization.id, project.id, seeded.id))?.date_range).toEqual(frozen);

    const result = await migrateSeededBoardsToRelativeDateRange({ organizationId: organization.id });
    expect(result.migrated).toEqual([
      { organizationId: organization.id, projectId: project.id, boardId: seeded.id, name: 'Landing page performance', previousDateRange: frozen },
    ]);

    const migrated = (await getBoard(organization.id, project.id, seeded.id))!;
    expect(migrated.date_range).toEqual({ kind: 'relative', preset: 'last_30_days', grain: 'day' });
    expect(migrated.updated_by).toBe(updatedByBefore);
    expect((await getBoard(organization.id, project.id, human.id))?.date_range).toEqual(frozen);
    expect((await getBoard(organization.id, project.id, customized.id))?.date_range).toEqual({ start: '2026-06-01', end: '2026-06-30', grain: 'day' });
    expect((await getBoard(organization.id, project.id, regrained.id))?.date_range).toEqual({ ...frozen, grain: 'week' });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(
      entries.some((entry) => entry.target_id === seeded.id && entry.actor_id === BOARD_DATE_RANGE_MIGRATION_ACTOR_ID && entry.actor_type === 'system'),
    ).toBe(true);

    const secondRun = await migrateSeededBoardsToRelativeDateRange({ organizationId: organization.id });
    expect(secondRun.migrated).toEqual([]);
  });

  it('scans every organization when unscoped, and rejects a project scope without an organization', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Migration Unscoped Org');
    const seeded = await legacyBoard(organization.id, project.id, owner.id, 'Marketing overview', 'com.growthos.saas-marketing-metrics', {
      start: '2026-07-29',
      end: '2026-08-27',
      grain: 'day',
    });

    const result = await migrateSeededBoardsToRelativeDateRange({ dryRun: true });
    expect(result.migrated.some((ref) => ref.boardId === seeded.id)).toBe(true);
    await expect(migrateSeededBoardsToRelativeDateRange({ projectId: project.id })).rejects.toThrow(/organizationId/);
  });

  it('hasUntouchedSeededDefaultDateRange tolerates a seed that straddled UTC midnight', () => {
    const base = { seeded_by_plugin_id: 'com.growthos.landing-page-pack', created_at: '2026-08-28T00:00:00.004Z' };
    expect(hasUntouchedSeededDefaultDateRange({ ...base, date_range: { start: '2026-07-29', end: '2026-08-27', grain: 'day' } })).toBe(true);
    expect(hasUntouchedSeededDefaultDateRange({ ...base, date_range: { start: '2026-07-30', end: '2026-08-28', grain: 'day' } })).toBe(true);
    expect(hasUntouchedSeededDefaultDateRange({ ...base, date_range: { start: '2026-07-28', end: '2026-08-26', grain: 'day' } })).toBe(false);
    expect(hasUntouchedSeededDefaultDateRange({ ...base, date_range: { kind: 'relative', preset: 'last_30_days', grain: 'day' } })).toBe(false);
    expect(hasUntouchedSeededDefaultDateRange({ ...base, seeded_by_plugin_id: null, date_range: { start: '2026-07-29', end: '2026-08-27', grain: 'day' } })).toBe(false);
    expect(
      hasUntouchedSeededDefaultDateRange({
        seeded_by_plugin_id: 'com.growthos.landing-page-pack',
        created_at: Date.parse('2026-08-27T10:00:00.000Z') as unknown as string,
        date_range: { start: '2026-07-29', end: '2026-08-27', grain: 'day' },
      }),
    ).toBe(true);
  });
});
