import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFunnelGoalsCockpitData } from './funnel-goals-synthesizer';
import { buildUnifiedAdsCockpitData } from './ads-performance-synthesizer';
import { buildExecutiveReportData } from './executive-reporting-synthesizer';
import { synthesizeProactiveRecommendations } from './recommendation-synthesizer';
import type { AutomationTargetView } from './automation-view';

/**
 * Guard for Jira B15: data that is fabricated, estimated or stubbed must never be presented as
 * real.
 *
 * An integrator found the funnel page on a REAL customer project (EasySign, no funnel defined)
 * showing "Simulated Mode (Zero-Config)" with 955 started / 363 viewed / 210 signed, a 22%
 * conversion, a drop-off alert and an AI Copilot retargeting suggestion - all computed from a
 * sample funnel scaled by a hash of the project id. The same module invented goals, cohorts,
 * payback windows, quality tiers and a payback target.
 *
 * Two checks, because either alone can be dodged:
 *  1. Behavioural: feed every synthesizer its no-data inputs and walk the whole output. Every
 *     numeric leaf must be a real count (and therefore 0) - anything else is a number that came
 *     from nowhere. Arrays of alerts / recommendations must be empty.
 *  2. Source: the named generators must not come back under their old names.
 */

type NumericLeaf = { path: string; value: number };

function numericLeaves(value: unknown, at = '$'): NumericLeaf[] {
  if (typeof value === 'number') return [{ path: at, value }];
  if (value instanceof Map) {
    return [...value.entries()].flatMap(([k, v]) => numericLeaves(v, `${at}.get(${String(k)})`));
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => numericLeaves(v, `${at}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numericLeaves(v, `${at}.${k}`));
  }
  return [];
}

/** Paths whose number is a count of real things the caller passed in - legitimately 0 here. */
const REAL_COUNT_PATHS = new Set([
  '$.summary.activeGoalsCount',
  '$.summary.goalsMeasuredCount',
  '$.summary.goalsOnTrackCount',
  '$.summary.goalsPausedCount',
  '$.goalsSummary.totalGoalsCount',
  '$.goalsSummary.measuredGoalsCount',
  '$.goalsSummary.onTrackCount',
  '$.goalsSummary.pausedGoalsCount',
  '$.goalsSummary.atRiskCount',
  '$.goalsSummary.offTrackCount',
  '$.goalsSummary.activeGoalsCount',
  '$.summary.activeCampaignsCount',
  '$.summary.totalCampaignsCount',
  '$.summary.campaignsWithSpendCount',
]);

function expectNoInventedNumbers(output: unknown): void {
  const invented = numericLeaves(output).filter((leaf) => !(REAL_COUNT_PATHS.has(leaf.path) && leaf.value === 0));
  expect(invented).toEqual([]);
}

describe('no synthesizer invents data when real data is absent (Jira B15)', () => {
  describe('buildFunnelGoalsCockpitData', () => {
    const absentInputs = {
      'the integrator case: no funnel defined, nothing landed': {
        funnelOutcome: { ok: true as const, steps: [] },
        goals: [],
        cohortOutcome: { ok: true as const, rows: [] },
        paybackOutcome: { ok: true as const, windows: [] },
        calibrationOutcome: { ok: true as const, tiers: [] },
      },
      'every query threw (null outcomes)': {
        funnelOutcome: null,
        goals: [],
      },
      'the warehouse is not configured': {
        funnelOutcome: { ok: false as const, reason: 'warehouse_not_configured' as const, message: 'x' },
        goals: [],
        cohortOutcome: { ok: false as const, reason: 'warehouse_not_configured' as const, message: 'x' },
        paybackOutcome: { ok: false as const, reason: 'warehouse_not_configured' as const, message: 'x' },
        calibrationOutcome: { ok: false as const, reason: 'warehouse_not_configured' as const, message: 'x' },
      },
      'payback windows that sum over no rows': {
        funnelOutcome: { ok: true as const, steps: [] },
        goals: [],
        paybackOutcome: {
          ok: true as const,
          windows: [
            { windowDays: 7 as const, collectedRevenue: 0 },
            { windowDays: 40 as const, collectedRevenue: 0 },
          ],
        },
      },
    };

    for (const [label, input] of Object.entries(absentInputs)) {
      it(`${label}: no numbers, no alerts, no recommendation`, () => {
        const cockpit = buildFunnelGoalsCockpitData(input);
        expectNoInventedNumbers(cockpit);
        expect(cockpit.funnelSteps).toEqual([]);
        expect(cockpit.goals).toEqual([]);
        expect(cockpit.cohortRows).toEqual([]);
        expect(cockpit.paybackVelocity).toEqual([]);
        expect(cockpit.qualityCalibration).toEqual([]);
        expect(cockpit.proactiveRecommendation).toBeNull();
        expect(cockpit.funnelViewKind).not.toBe('ok');
      });
    }
  });

  it('buildUnifiedAdsCockpitData: no campaigns, no spend - only zero counts', () => {
    expectNoInventedNumbers(buildUnifiedAdsCockpitData([], null));
  });

  it('buildUnifiedAdsCockpitData: real campaigns without spend carry only their own budget', () => {
    const targets = [
      { id: 't1', label: 'Brand', dailyBudgetUsd: 120, campaignStatus: 'enabled' },
    ] as unknown as AutomationTargetView[];
    const { items, summary } = buildUnifiedAdsCockpitData(targets, { ok: true, rows: [] } as never);
    // dailyBudgetUsd is the campaign's own configuration, not a measurement - the one number allowed.
    expect(numericLeaves(items).map((l) => l.path)).toEqual(['$[0].dailyBudgetUsd']);
    expect(summary.totalSpendUsd).toBeNull();
    expect(summary.blendedRoas).toBeNull();
  });

  it('buildExecutiveReportData: no spend - no metrics, no channel split, no rebalancing advice', () => {
    const report = buildExecutiveReportData({});
    expectNoInventedNumbers(report);
    expect(report.channels).toEqual([]);
    expect(report.rebalancingRecommendation).toBeUndefined();
  });

  it('synthesizeProactiveRecommendations: nothing measured - no recommendations', () => {
    expect(synthesizeProactiveRecommendations([], [])).toEqual([]);
    const unmeasured = buildUnifiedAdsCockpitData(
      [{ id: 't1', label: 'Brand', dailyBudgetUsd: 500, campaignStatus: 'enabled' }] as unknown as AutomationTargetView[],
      null,
    ).items;
    expect(synthesizeProactiveRecommendations(unmeasured, [])).toEqual([]);
  });
});

describe('removed mock generators stay removed (Jira B15)', () => {
  const WEB_ROOT = path.resolve(__dirname, '..', '..');
  const SCANNED = ['app', 'components', 'lib'];
  const BANNED = [
    'createMockEasySignFunnel',
    'buildDeterministicDemoGoals',
    'getDeterministicFactor',
    'DEFAULT_EASYSIGN_STEPS',
    'DEFAULT_COHORTS',
    'DEFAULT_PAYBACK_WINDOWS',
    'DEFAULT_QUALITY_TIERS',
    'DEFAULT_GOALS',
    'windowDays * 1200',
  ];

  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        sourceFiles(full, found);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
        found.push(full);
      }
    }
    return found;
  }

  it('no production source file references a removed fabrication helper', () => {
    const files = SCANNED.flatMap((dir) => sourceFiles(path.join(WEB_ROOT, dir)));
    expect(files.length).toBeGreaterThan(100);

    const offenders = files.flatMap((file) => {
      // Comments are stripped: several files document what was removed, by name, on purpose.
      // (Naive, but it can only hide a match inside a comment - never inside code.)
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      return BANNED.filter((name) => source.includes(name)).map(
        (name) => `${path.relative(WEB_ROOT, file).replace(/\\/g, '/')}: ${name}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
