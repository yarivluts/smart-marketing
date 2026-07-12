import { describe, expect, it } from 'vitest';
import { deriveCurrentFreshness, overallFreshnessAsOf, type OrchestrationRunView } from './orchestration-view';

function run(overrides: Partial<OrchestrationRunView> & Pick<OrchestrationRunView, 'id' | 'status'>): OrchestrationRunView {
  return {
    startedAt: '2026-07-06T11:00:00Z',
    finishedAt: '2026-07-06T11:00:05Z',
    freshness: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('deriveCurrentFreshness', () => {
  it('returns null when there is no run history at all', () => {
    expect(deriveCurrentFreshness([])).toBeNull();
  });

  it('returns null when every run so far has failed', () => {
    const runs = [run({ id: 'r2', status: 'failed', errorMessage: 'boom' }), run({ id: 'r1', status: 'failed', errorMessage: 'boom' })];
    expect(deriveCurrentFreshness(runs)).toBeNull();
  });

  it('picks the newest succeeded run, skipping a more recent failure', () => {
    const succeeded = run({
      id: 'r1',
      status: 'succeeded',
      freshness: [{ table: 'entities', rowCount: 2, latestRecordAt: '2026-01-20T14:12:00Z' }],
    });
    // Newest-first order, same as `listOrchestrationRunsForProject` returns.
    const runs = [run({ id: 'r2', status: 'failed', errorMessage: 'boom' }), succeeded];

    expect(deriveCurrentFreshness(runs)).toBe(succeeded);
  });

  it('picks the most recent succeeded run when several have succeeded', () => {
    const newest = run({ id: 'r2', status: 'succeeded', freshness: [] });
    const older = run({ id: 'r1', status: 'succeeded', freshness: [] });
    expect(deriveCurrentFreshness([newest, older])).toBe(newest);
  });
});

describe('overallFreshnessAsOf', () => {
  it('returns null for an empty snapshot', () => {
    expect(overallFreshnessAsOf([])).toBeNull();
  });

  it('returns null when every table has no rows yet', () => {
    expect(
      overallFreshnessAsOf([
        { table: 'entities', rowCount: 0, latestRecordAt: null },
        { table: 'events', rowCount: 0, latestRecordAt: null },
      ]),
    ).toBeNull();
  });

  it('returns the oldest non-null timestamp, not the newest — a single stalled table should drag the whole figure down', () => {
    expect(
      overallFreshnessAsOf([
        { table: 'entities', rowCount: 5, latestRecordAt: '2026-07-10T00:00:00.000Z' },
        { table: 'events', rowCount: 5, latestRecordAt: '2026-07-01T00:00:00.000Z' },
        { table: 'measures', rowCount: 5, latestRecordAt: '2026-07-08T00:00:00.000Z' },
      ]),
    ).toBe('2026-07-01T00:00:00.000Z');
  });

  it('compares parsed instants, not raw strings — a whole-second timestamp (no fraction, as read_freshness.py emits when microseconds are exactly zero) is correctly treated as earlier than a later-in-the-same-second timestamp that does carry a fraction, even though "." sorts before "Z" lexicographically', () => {
    expect(
      overallFreshnessAsOf([
        { table: 'entities', rowCount: 5, latestRecordAt: '2026-07-10T14:12:00.500000Z' },
        { table: 'events', rowCount: 5, latestRecordAt: '2026-07-10T14:12:00Z' },
      ]),
    ).toBe('2026-07-10T14:12:00Z');
  });

  it('ignores a table with no rows yet (null) rather than letting it win as "oldest"', () => {
    expect(
      overallFreshnessAsOf([
        { table: 'entities', rowCount: 5, latestRecordAt: '2026-07-10T00:00:00.000Z' },
        { table: 'measures', rowCount: 0, latestRecordAt: null },
      ]),
    ).toBe('2026-07-10T00:00:00.000Z');
  });
});
