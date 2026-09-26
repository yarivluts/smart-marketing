import { describe, expect, it } from 'vitest';
import type { GoalModel, GoalProgressOutcome } from '@growthos/firebase-orm-models';
import type { GoalProgressResult } from '@growthos/shared';
import { buildGoalThermometerView, toGoalSummaryView } from './goal-view';

function goal(overrides: Partial<GoalModel> & Pick<GoalModel, 'id'>): GoalModel {
  return {
    name: 'Q3 signups',
    metric_name: 'signups',
    direction: 'maximize',
    target_value: 1000,
    range_min: null,
    range_max: null,
    deadline: '2026-09-30',
    owner_person_id: 'person-1',
    ...overrides,
  } as GoalModel;
}

function okOutcome(
  actualValue: number,
  progress: Partial<GoalProgressResult>,
  // Defaults true: these cases are about pace arithmetic, and a goal with no measurements at
  // all short-circuits before pace is computed - that path has its own cases below.
  hasMeasurements = true,
): GoalProgressOutcome {
  return {
    ok: true,
    hasMeasurements,
    actualValue,
    progress: {
      expectedAtNow: 0,
      progressRatio: 0,
      projectedFinalValue: 0,
      status: 'on_track',
      isGoalMet: false,
      ...progress,
    },
  };
}

describe('toGoalSummaryView', () => {
  it('maps a goal to its list-card summary', () => {
    const view = toGoalSummaryView(goal({ id: 'g1' }));
    expect(view).toEqual({
      id: 'g1',
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      rangeMin: null,
      rangeMax: null,
      deadline: '2026-09-30',
      ownerPersonId: 'person-1',
    });
  });
});

describe('buildGoalThermometerView', () => {
  it("carries the metric's declared unit, and none for a plain number (KAN-213)", () => {
    const ratio = buildGoalThermometerView(okOutcome(0.05), { kind: 'ratio' });
    expect(ratio.kind === 'ok' && ratio.unit).toEqual({ kind: 'ratio' });
    const plain = buildGoalThermometerView(okOutcome(5), { kind: 'number' });
    expect(plain.kind === 'ok' && 'unit' in plain).toBe(false);
  });

  it('maps on_track/at_risk/off_track to green/amber/red', () => {
    const onTrack = buildGoalThermometerView(okOutcome(50, { status: 'on_track' }));
    expect(onTrack.kind).toBe('ok');
    expect(onTrack.kind === 'ok' && onTrack.statusColor).toBe('green');
    const atRisk = buildGoalThermometerView(okOutcome(50, { status: 'at_risk' }));
    expect(atRisk.kind).toBe('ok');
    expect(atRisk.kind === 'ok' && atRisk.statusColor).toBe('amber');
    const offTrack = buildGoalThermometerView(okOutcome(50, { status: 'off_track' }));
    expect(offTrack.kind).toBe('ok');
    expect(offTrack.kind === 'ok' && offTrack.statusColor).toBe('red');
  });

  it('clamps progressRatio into a 0-100 percentFilled range for maximize/minimize (uncapped ratio can exceed 1 or go negative-adjacent)', () => {
    const overTarget = buildGoalThermometerView(okOutcome(150, { progressRatio: 1.5 }));
    expect(overTarget.kind === 'ok' && overTarget.percentFilled).toBe(100);

    const underTarget = buildGoalThermometerView(okOutcome(30, { progressRatio: 0.3 }));
    expect(underTarget.kind === 'ok' && underTarget.percentFilled).toBeCloseTo(30, 10);

    const zero = buildGoalThermometerView(okOutcome(0, { progressRatio: 0 }));
    expect(zero.kind === 'ok' && zero.percentFilled).toBe(0);
  });

  it('clamps a range goal’s progressRatio (already 0..1) straight through to percentFilled', () => {
    const view = buildGoalThermometerView(okOutcome(15, { progressRatio: 0.5 }));
    expect(view.kind === 'ok' && view.percentFilled).toBeCloseTo(50, 10);
  });

  it('passes through actualValue/expectedAtNow/projectedFinalValue/isGoalMet unchanged', () => {
    const view = buildGoalThermometerView(
      okOutcome(65, { expectedAtNow: 50, projectedFinalValue: 70, isGoalMet: false, status: 'off_track', progressRatio: 0.77 }),
    );
    expect(view).toMatchObject({
      kind: 'ok',
      actualValue: 65,
      expectedAtNow: 50,
      projectedFinalValue: 70,
      isGoalMet: false,
      status: 'off_track',
      statusColor: 'red',
    });
  });

  it('maps each degraded outcome reason to its own render kind', () => {
    expect(buildGoalThermometerView({ ok: false, reason: 'warehouse_not_configured', message: 'x' })).toEqual({
      kind: 'warehouse_not_configured',
    });
    expect(buildGoalThermometerView({ ok: false, reason: 'quota_exceeded', message: 'quota is spent' })).toEqual({
      kind: 'quota_exceeded',
      message: 'quota is spent',
    });
    expect(buildGoalThermometerView({ ok: false, reason: 'query_error', message: 'bad query' })).toEqual({
      kind: 'query_error',
      message: 'bad query',
    });
  });
});

/**
 * A goal on a metric that has never received a record summed to 0, and pace computed against
 * that 0 rendered "off track" in red at 0% filled - a project that has not started reporting
 * shown exactly like one that is failing. The two call for opposite responses: one means go and
 * fix your tracking, the other means go and fix your business.
 */
describe('buildGoalThermometerView - no measurements', () => {
  it('reports no_measurements rather than an off-track pace when the metric returned no rows', () => {
    const view = buildGoalThermometerView({
      ok: true,
      hasMeasurements: false,
      actualValue: 0,
      progress: { expectedAtNow: 50, progressRatio: 0, projectedFinalValue: 0, status: 'off_track', isGoalMet: false },
    });

    expect(view.kind).toBe('no_measurements');
  });

  it('still reports a genuine zero as a real pace when rows were returned', () => {
    const view = buildGoalThermometerView({
      ok: true,
      hasMeasurements: true,
      actualValue: 0,
      progress: { expectedAtNow: 50, progressRatio: 0, projectedFinalValue: 0, status: 'off_track', isGoalMet: false },
    });

    expect(view.kind).toBe('ok');
    expect(view.kind === 'ok' && view.status).toBe('off_track');
    expect(view.kind === 'ok' && view.actualValue).toBe(0);
  });

  it('keeps the typed degraded states ahead of the measurement check', () => {
    // A warehouse that is not configured has no measurements either, but saying "no data yet"
    // would send someone to look at their tracking when the warehouse is the problem.
    expect(buildGoalThermometerView({ ok: false, reason: 'warehouse_not_configured', message: 'nope' }).kind).toBe(
      'warehouse_not_configured',
    );
  });
});
