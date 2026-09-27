import { describe, expect, it } from 'vitest';
import type { SetupEnvironmentHealth, SetupHealthReport } from '@growthos/shared';
import {
  auditActionCategory,
  auditActionDomain,
  dailyTotals,
  groupByDay,
  initialsFor,
  onboardingJourneyStates,
  onboardingProgress,
  pickFocusProject,
  pickHeadlineEnvironment,
  projectHealthStatus,
  shortDayLabel,
  sourceRunSeries,
  stableIndex,
  summarizeProjectHealth,
  timeAgoParts,
  topCounts,
} from './workspace-view';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');

function environment(name: string, score: number, overrides: Partial<SetupEnvironmentHealth> = {}): SetupEnvironmentHealth {
  return {
    environmentId: `env-${name}`,
    environmentName: name,
    requirements: [
      { requirementId: 'signups', status: 'connected', acceptedSchemas: [], rejectedSchemas: [], silentRegisteredSchemas: [], quarantineReasons: [], lastAcceptedAt: null },
      { requirementId: 'billing', status: 'gap', acceptedSchemas: [], rejectedSchemas: [], silentRegisteredSchemas: [], quarantineReasons: [], lastAcceptedAt: null },
    ],
    connectedCount: 1,
    totalCount: 2,
    coreConnectedCount: 1,
    coreTotalCount: 1,
    score,
    ...overrides,
  };
}

describe('dailyTotals', () => {
  it('buckets values by UTC day over the trailing window, zero-filling empty days and ignoring older items', () => {
    const items = [
      { at: '2026-09-20T01:00:00.000Z', n: 2 },
      { at: '2026-09-20T09:00:00.000Z', n: 3 },
      { at: '2026-09-18T23:59:00.000Z', n: 4 },
      { at: '2026-09-01T00:00:00.000Z', n: 100 },
      { at: 'not a date', n: 7 },
    ];
    expect(dailyTotals(items, (item) => item.at, (item) => item.n, 3, NOW)).toEqual([
      { day: '2026-09-18', value: 4 },
      { day: '2026-09-19', value: 0 },
      { day: '2026-09-20', value: 5 },
    ]);
  });

  it('formats a short axis label', () => {
    expect(shortDayLabel('2026-09-18')).toBe('09-18');
  });
});

describe('topCounts', () => {
  it('counts and ranks values, capped at the limit', () => {
    expect(topCounts(['a', 'b', 'a', 'c', 'a', 'b'], 2)).toEqual([
      { key: 'a', count: 3 },
      { key: 'b', count: 2 },
    ]);
  });
});

describe('initialsFor / stableIndex', () => {
  it('derives up to two initials from a name or an email local part', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL');
    expect(initialsFor('ada.lovelace@example.com')).toBe('AL');
    expect(initialsFor('yariv.luts+growthos-screens@gmail.com')).toBe('YL');
    expect(initialsFor('ada@example.com')).toBe('A');
    expect(initialsFor('---')).toBe('?');
  });

  it('maps the same id to the same index', () => {
    expect(stableIndex('user-1', 8)).toBe(stableIndex('user-1', 8));
    expect(stableIndex('user-1', 8)).toBeGreaterThanOrEqual(0);
    expect(stableIndex('user-1', 8)).toBeLessThan(8);
  });
});

describe('project health', () => {
  it('reads the headline score from production once anything is connected there', () => {
    const report: SetupHealthReport = { environments: [environment('dev', 80), environment('prod', 33)] };
    expect(pickHeadlineEnvironment(report)?.environmentName).toBe('prod');
    expect(pickHeadlineEnvironment(null)).toBeNull();
  });

  it('falls back to the furthest-along environment while production has nothing connected', () => {
    const emptyProd = environment('prod', 0, { connectedCount: 0 });
    expect(pickHeadlineEnvironment({ environments: [environment('dev', 83), emptyProd, environment('staging', 0, { connectedCount: 0 })] })?.environmentName).toBe('dev');
    // All tied at zero: production wins the tie.
    expect(pickHeadlineEnvironment({ environments: [environment('dev', 0, { connectedCount: 0 }), emptyProd] })?.environmentName).toBe('prod');
  });

  it('summarises the setup report and recent batches without inventing anything', () => {
    const report: SetupHealthReport = { environments: [environment('dev', 50), environment('prod', 50)] };
    const batches = [
      { created_at: '2026-09-20T11:30:00.000Z', accepted_count: 10, quarantined_count: 0 },
      { created_at: '2026-09-19T08:00:00.000Z', accepted_count: 5, quarantined_count: 1 },
      // Outside the 3-day window: excluded from the counts and the sparkline.
      { created_at: '2026-09-01T08:00:00.000Z', accepted_count: 900, quarantined_count: 90 },
    ];
    const snapshot = summarizeProjectHealth(report, batches, NOW, 3);
    expect(snapshot.score).toBe(50);
    expect(snapshot.headlineEnvironment).toBe('prod');
    expect(snapshot.environments.map((entry) => entry.name)).toEqual(['prod', 'dev']);
    expect(snapshot.requirements).toEqual([
      { id: 'signups', status: 'connected' },
      { id: 'billing', status: 'gap' },
    ]);
    expect(snapshot.lastIngestAt).toBe('2026-09-20T11:30:00.000Z');
    expect(snapshot.minutesSinceIngest).toBe(30);
    expect(snapshot.acceptedCount).toBe(15);
    expect(snapshot.quarantinedCount).toBe(1);
    expect(snapshot.batchCount).toBe(2);
    expect(snapshot.dailyAccepted).toEqual([0, 5, 10]);
    expect(snapshot.status).toBe('warn');
  });

  it('is idle with no batches and no report', () => {
    const snapshot = summarizeProjectHealth(null, [], NOW);
    expect(snapshot.score).toBeNull();
    expect(snapshot.minutesSinceIngest).toBeNull();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.dailyAccepted).toHaveLength(14);
  });

  it('grades a project ok only when fresh, core-complete and quarantine-free', () => {
    expect(projectHealthStatus({ score: 100, coreConnected: 3, coreTotal: 3, minutesSinceIngest: 10, quarantinedCount: 0 })).toBe('ok');
    expect(projectHealthStatus({ score: 100, coreConnected: 3, coreTotal: 3, minutesSinceIngest: 3000, quarantinedCount: 0 })).toBe('warn');
    expect(projectHealthStatus({ score: 0, coreConnected: 0, coreTotal: 3, minutesSinceIngest: 10, quarantinedCount: 4 })).toBe('error');
    expect(projectHealthStatus({ score: null, coreConnected: 0, coreTotal: 0, minutesSinceIngest: null, quarantinedCount: 0 })).toBe('idle');
  });

  it('splits elapsed minutes into a readable unit', () => {
    expect(timeAgoParts(5)).toEqual({ unit: 'minutes', value: 5 });
    expect(timeAgoParts(125)).toEqual({ unit: 'hours', value: 2 });
    expect(timeAgoParts(5 * 24 * 60)).toEqual({ unit: 'days', value: 5 });
  });
});

describe('audit log shaping', () => {
  it('categorises actions by their verb and domain', () => {
    expect(auditActionCategory('board.create')).toBe('create');
    expect(auditActionCategory('plugin_manifest.register')).toBe('create');
    expect(auditActionCategory('goal.update_definition')).toBe('update');
    expect(auditActionCategory('project.session_replay_template.set')).toBe('update');
    expect(auditActionCategory('segment.delete')).toBe('delete');
    expect(auditActionCategory('membership.role_granted')).toBe('access');
    expect(auditActionCategory('membership.suspended')).toBe('delete');
    expect(auditActionCategory('api_key.mint')).toBe('access');
    expect(auditActionCategory('quarantined_record.replay')).toBe('data');
    expect(auditActionCategory('orchestration_run.trigger')).toBe('run');
    expect(auditActionCategory('something')).toBe('other');
  });

  it('humanises the action domain', () => {
    expect(auditActionDomain('resource_attachment.push')).toBe('resource attachment');
    expect(auditActionDomain('board')).toBe('board');
  });

  it('groups entries by day, newest day first', () => {
    const groups = groupByDay([
      { id: 'a', createdAt: '2026-09-20T10:00:00.000Z' },
      { id: 'b', createdAt: '2026-09-20T09:00:00.000Z' },
      { id: 'c', createdAt: '2026-09-18T09:00:00.000Z' },
    ]);
    expect(groups.map((group) => [group.day, group.entries.map((entry) => entry.id)])).toEqual([
      ['2026-09-20', ['a', 'b']],
      ['2026-09-18', ['c']],
    ]);
  });
});

describe('sourceRunSeries', () => {
  it('charts counted runs oldest first, skipping runs without counts', () => {
    const run = (startedAt: string, fetched: number | null, accepted: number | null) => ({
      startedAt,
      recordsFetched: fetched,
      recordsAccepted: accepted,
      recordsQuarantined: fetched === null ? null : 1,
      recordsDuplicate: null,
    });
    expect(sourceRunSeries([run('2026-09-20T10:05:00.000Z', 5, 4), run('2026-09-20T09:00:00.000Z', null, null), run('2026-09-19T08:30:00.000Z', 3, 2)])).toEqual([
      { run: '09-19 08:30', accepted: 2, quarantined: 1, duplicate: 0 },
      { run: '09-20 10:05', accepted: 4, quarantined: 1, duplicate: 0 },
    ]);
  });
});

describe('pickFocusProject', () => {
  it('follows the unfinished project that is furthest along', () => {
    expect(pickFocusProject([{ id: 'a', step: null }, { id: 'b', step: 'funnel' as const }, { id: 'c', step: 'done' as const }])?.id).toBe('b');
    expect(pickFocusProject([{ id: 'a', step: 'pack' as const }, { id: 'b', step: 'pack' as const }])?.id).toBe('a');
  });

  it('falls back to the first project when all are finished, and null when there are none', () => {
    expect(pickFocusProject([{ id: 'a', step: 'done' as const }, { id: 'b', step: 'done' as const }])?.id).toBe('a');
    expect(pickFocusProject([])).toBeNull();
  });
});

describe('onboarding journey', () => {
  it('marks steps before the stored step done, the stored step current and the rest upcoming', () => {
    expect(onboardingJourneyStates(null)).toEqual({ start: 'current', pack: 'upcoming', sources: 'upcoming', funnel: 'upcoming', board: 'upcoming', done: 'upcoming' });
    expect(onboardingJourneyStates('funnel')).toEqual({ start: 'done', pack: 'done', sources: 'done', funnel: 'current', board: 'upcoming', done: 'upcoming' });
    expect(onboardingJourneyStates('done')).toEqual({ start: 'done', pack: 'done', sources: 'done', funnel: 'done', board: 'done', done: 'done' });
  });

  it('reports progress over the four working steps', () => {
    expect(onboardingProgress(null)).toEqual({ completed: 0, total: 4, percent: 0 });
    expect(onboardingProgress('funnel')).toEqual({ completed: 2, total: 4, percent: 50 });
    expect(onboardingProgress('done')).toEqual({ completed: 4, total: 4, percent: 100 });
  });
});
