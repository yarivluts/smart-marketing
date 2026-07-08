import { describe, expect, it } from 'vitest';
import { LocalDbtOrchestrationExecutor } from './local-dbt-executor';

/**
 * The one place in this whole package that actually spawns a real dbt
 * subprocess against `@growthos/dbt-transform`'s buildable-today DuckDB
 * stand-in (see `local-dbt-executor.ts`'s own doc comment). Deliberately
 * kept as the *only* such test: DuckDB only tolerates one writer to a given
 * database file at a time, and `dbt build` holds a write lock for the
 * duration of the run, so two of these running concurrently (e.g. this file
 * racing `@growthos/dbt-transform`'s own `pnpm test`, which builds the same
 * database) would be a real, flaky conflict rather than a hypothetical one
 * — `turbo.json` orders `@growthos/dbt-transform#test` ahead of
 * `@growthos/firebase-orm-models#test` specifically to rule that out, and
 * every other orchestration test in this package (`orchestration.emulator.test.ts`)
 * injects a fake executor instead of exercising this one.
 *
 * These two cases were confirmed by hand against the actual fixture before
 * being written down here (`node scripts/run-orchestration.mjs org_1 proj_1 …`
 * from `packages/dbt-transform`) rather than guessed at.
 */
describe('LocalDbtOrchestrationExecutor', () => {
  it('runs a real dbt build and reads back real freshness for the fixture’s own project', async () => {
    const executor = new LocalDbtOrchestrationExecutor();
    const result = await executor.run({ organizationId: 'org_1', projectId: 'proj_1' });

    expect(result.freshness).toEqual(
      expect.arrayContaining([
        { table: 'entities', rowCount: 2, latestRecordAt: '2026-01-20T14:12:00Z' },
        { table: 'events', rowCount: 3, latestRecordAt: '2026-01-07T12:00:03Z' },
        { table: 'measures', rowCount: 3, latestRecordAt: '2026-01-06T23:59:00Z' },
      ]),
    );
    expect(result.freshness).toHaveLength(3);
  }, 60_000);

  it('comes back with zero rows for a project the fixture has never heard of — an honest, documented limitation until the fixture is replaced by a real per-project export', async () => {
    const executor = new LocalDbtOrchestrationExecutor();
    const result = await executor.run({ organizationId: 'org-does-not-exist', projectId: 'project-does-not-exist' });

    expect(result.freshness).toEqual(
      expect.arrayContaining([
        { table: 'entities', rowCount: 0, latestRecordAt: null },
        { table: 'events', rowCount: 0, latestRecordAt: null },
        { table: 'measures', rowCount: 0, latestRecordAt: null },
      ]),
    );
  }, 60_000);
});
