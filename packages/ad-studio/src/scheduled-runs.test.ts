// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({ getAdStudioRun: vi.fn(), listAdStudioRunIndex: vi.fn(), removeAdStudioRunIndex: vi.fn() }));
vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));

import { AdStudioRunNotFoundError } from '@growthos/firebase-orm-models';
import { AD_STUDIO_SCHEDULER_UNITS_PER_RUN, runScheduledAdStudioRuns } from './scheduled-runs';

const line = (runId: string) => ({ organization_id: 'o', project_id: 'p', brief_id: `b-${runId}`, run_id: runId, started_by: 'u1', started_on: '2026-10-15T08:00:00.000Z' });
const run = (status: string, stamp: number) => ({ id: 'r', status, last_advanced_on: new Date(stamp).toISOString() });

beforeEach(() => vi.clearAllMocks());

describe('runScheduledAdStudioRuns', () => {
  it('advances a running run as its starter until it finishes, then drops it from the index', async () => {
    orm.listAdStudioRunIndex.mockResolvedValue([line('r1')]);
    orm.getAdStudioRun.mockResolvedValue(run('running', 0));
    let calls = 0;
    const step = vi.fn(async () => {
      calls += 1;
      return run(calls < 3 ? 'running' : 'done', calls) as never;
    });
    const passes = await runScheduledAdStudioRuns({ autopilot: {} as never, budgetMs: 60_000, step });
    expect(passes).toEqual([{ runId: 'r1', organizationId: 'o', projectId: 'p', units: 3, outcome: 'finished' }]);
    expect(step).toHaveBeenCalledWith({ organizationId: 'o', projectId: 'p', briefId: 'b-r1', runId: 'r1', actorId: 'u1' }, {});
    expect(orm.removeAdStudioRunIndex).toHaveBeenCalledWith('r1');
  });

  it('leaves a plan waiting for the person, gives way to an open tab, and caps one run', async () => {
    orm.listAdStudioRunIndex.mockResolvedValue([line('waiting'), line('tab'), line('long')]);
    orm.getAdStudioRun.mockImplementation(async (_o: string, _p: string, _b: string, runId: string) => (runId === 'waiting' ? run('awaiting_approval', 0) : run('running', 0)));
    let stamp = 0;
    const step = vi.fn(async (ids: { runId: string }) => (ids.runId === 'tab' ? run('running', 0) : run('running', ++stamp)) as never);
    const passes = await runScheduledAdStudioRuns({ autopilot: {} as never, budgetMs: 60_000, step });
    expect(passes.map((pass) => [pass.runId, pass.units, pass.outcome])).toEqual([
      ['waiting', 0, 'waiting'],
      ['tab', 0, 'busy'],
      ['long', AD_STUDIO_SCHEDULER_UNITS_PER_RUN, 'worked'],
    ]);
    expect(orm.removeAdStudioRunIndex).not.toHaveBeenCalled();
  });

  it('drops lines of runs that finished or no longer exist, records a failure, and stops at the budget', async () => {
    orm.listAdStudioRunIndex.mockResolvedValue([line('done'), line('gone'), line('broken'), line('late')]);
    orm.getAdStudioRun.mockImplementation(async (_o: string, _p: string, _b: string, runId: string) => {
      if (runId === 'gone') throw new AdStudioRunNotFoundError();
      return runId === 'done' ? run('cancelled', 0) : run('running', 0);
    });
    let now = 0;
    const step = vi.fn(async () => {
      now += 120_000;
      throw new Error('boom');
    });
    const passes = await runScheduledAdStudioRuns({ autopilot: {} as never, budgetMs: 60_000, clock: () => now, step });
    expect(passes.map((pass) => [pass.runId, pass.outcome])).toEqual([
      ['done', 'finished'],
      ['gone', 'gone'],
      ['broken', 'provider_error'],
    ]);
    expect(orm.removeAdStudioRunIndex.mock.calls.map((call) => call[0])).toEqual(['done', 'gone']);
  });
});
