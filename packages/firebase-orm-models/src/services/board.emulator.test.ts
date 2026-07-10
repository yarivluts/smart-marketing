import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BoardNotFoundError,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  deleteBoard,
  ensureUserForFirebaseSession,
  getBoard,
  InMemoryMetricQueryResultCache,
  InvalidBoardError,
  listBoardsForProject,
  ProjectNotFoundError,
  queryBoardTile,
  registerMetricDefinition,
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

/** KAN-62's cohort engine, registered the same way any other `fact_*` table is (see `BOARD_TILE_TYPES`'s own doc comment on `board.model.ts` for why `cohort_month` as `timeColumn` gives a `heatmap` tile its matrix's row axis "for free" via the existing time-bucketing path). */
async function registerCohortRetention(organizationId: string, projectId: string, createdByUserId: string, dimensions: string[] = ['period_number']) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'cohort_retention_rate',
    definition: {
      kind: 'aggregation',
      aggregation: { function: 'avg', table: 'fact_cohort_retention', column: 'retention_rate', timeColumn: 'cohort_month', filters: [] },
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

class FakeWarehouseQueryExecutor implements WarehouseQueryExecutor {
  public callCount = 0;
  constructor(private readonly rows: WarehouseRow[]) {}
  execute(): Promise<WarehouseRow[]> {
    this.callCount += 1;
    return Promise.resolve(this.rows);
  }
}

describe('createBoard', () => {
  it('creates an empty board with a default trailing-30-day date range', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Create Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    expect(board.name).toBe('Marketing');
    expect(board.tiles).toEqual([]);
    expect(board.global_filters).toEqual([]);
    expect(board.compare).toBeNull();
    expect(board.date_range.grain).toBe('day');
    expect(board.date_range.start < board.date_range.end).toBe(true);
    expect(board.created_by).toBe(owner.id);
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
    expect(withFilters.date_range).toEqual({ start: '2026-01-01', end: '2026-01-31', grain: 'day' });
    expect(withFilters.compare).toBe('previous_period');
    expect(withFilters.global_filters).toEqual([{ field: 'channel', operator: '=', value: 'google' }]);
    expect(withFilters.name).toBe('Revenue');
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
    expect(board.date_range.grain).toBe('day');

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

    await deleteBoard(organization.id, project.id, board.id);

    expect(await getBoard(organization.id, project.id, board.id)).toBeNull();
    expect(await listBoardsForProject(organization.id, project.id)).toEqual([]);
  });

  it('throws BoardNotFoundError for a board that does not belong to this org+project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Delete Missing Org');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProject('Board Delete Other Org');
    const board = await createBoard({ organizationId: otherOrg.id, projectId: otherProject.id, name: 'Marketing', createdByUserId: owner.id });

    await expect(deleteBoard(organization.id, project.id, board.id)).rejects.toBeInstanceOf(BoardNotFoundError);
  });
});

describe('queryBoardTile', () => {
  it('returns the executor’s series for a big_number tile', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Board Query Org');
    await registerAdSpend(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    const rows: WarehouseRow[] = [{ bucket_date: board.date_range.start, ad_spend: 100 }];
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
    await registerSignups(organization.id, project.id, owner.id);
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });

    const first = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ metricNames: ['ad_spend'] }),
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: board.date_range.start, ad_spend: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(first.ok).toBe(true);

    const second = await queryBoardTile({
      organizationId: organization.id,
      projectId: project.id,
      board,
      tile: bigNumberTile({ metricNames: ['signups'], title: 'Signups' }),
      executor: new FakeWarehouseQueryExecutor([{ bucket_date: board.date_range.start, signups: 1 }]),
      cache: new InMemoryMetricQueryResultCache(),
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('quota_exceeded');
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
