import { describe, expect, it } from 'vitest';
import { deriveCurrentFreshness, type OrchestrationRunView } from './orchestration-view';

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
