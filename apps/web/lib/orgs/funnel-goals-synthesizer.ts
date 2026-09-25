import {
  computeElapsedFraction,
  type GoalDirection,
  type GoalPaceStatus,
  type GoalRhythm,
} from '@growthos/shared';
import type {
  CohortRetentionOutcome,
  FunnelStepsOutcome,
  GoalModel,
  GoalProgressOutcome,
  PaybackOverviewOutcome,
  QualityCalibrationBreakdownOutcome,
} from '@growthos/firebase-orm-models';
import { buildFunnelView, type FunnelView } from './funnel-view';
import { buildCohortRetentionView, type CohortRetentionView } from './cohort-retention-view';
import type { GoalProgressUnavailableReason } from './goal-view';

/*
  Data-honesty contract for this module (Jira B15).

  Everything returned here is either derived from a measurement the caller passed in, or it is
  absent - an empty list, a `null`, or a `kind` saying why there is nothing to show. There is no
  third option. This file used to have one: when a project had no funnel it returned
  `createMockEasySignFunnel`'s 1000/380/220 (scaled per project by a hash of the project id, so
  EasySign's real project showed 955/363/210); when it had no goals it returned five invented
  goals with invented owners; with no cohort, payback or calibration data it returned hard-coded
  retention rows, revenue windows and Diamond/Gold/Silver/Bronze tiers; and it applied an invented
  `windowDays * 1200` revenue target to REAL payback data. An integrator found the funnel page
  telling a real customer to launch a retargeting campaign against a drop-off nobody had measured.

  A reader cannot tell an invented number from a measured one, so an invented number must never
  be produced. When a measurement is missing, say what is missing.
*/

export interface FunnelStepItem {
  /** The event schema this step counts. Absent only for callers that never had one; the project's own funnel always carries it, and it is what tells apart two steps sharing a stage key (KAN-199). */
  eventSchemaName?: string;
  stageKey: string;
  stageLabel: string;
  stepOrder: number;
  /** People who reached this step having gone through every earlier step in order (B20) - never more than the step before. */
  customerCount: number;
  /** Share of the first step's people, 0..100. */
  conversionPercent: number;
  /** Share of the previous step's people lost at this step, 0..100 (0 for the first step). */
  dropOffPercent: number;
}

export type VisualFunnelStepItem = FunnelStepItem;

/** Why the funnel has nothing to show - `FunnelView`'s own degraded kinds. */
export type FunnelUnavailableKind = Exclude<FunnelView['kind'], 'ok'>;

/**
 * The funnel as the cockpit renders it. Only the `ok` branch carries numbers; every other branch
 * says why there are none (no funnel confirmed yet, warehouse not configured, quota, error).
 */
export type VisualFunnelData =
  | {
      kind: 'ok';
      totalStarted: number;
      totalCompleted: number;
      overallConversionPercent: number;
      biggestDropOffStageKey?: string;
      biggestDropOffPercent: number;
      steps: FunnelStepItem[];
    }
  | { kind: FunnelUnavailableKind };

/**
 * Where a goal's progress figures came from.
 *
 * - `ok`: measured by `queryGoalProgress` - the only kind that carries numbers.
 * - `no_measurements`: the query ran but the metric has no rows in the goal's window. A sum over
 *   no rows is 0, and pace against that 0 reads "off track"; that is not a measurement.
 * - `pending`: the goal was just created in this session and has not been queried yet.
 * - the `GoalProgressUnavailableReason`s: the query could not run or failed.
 */
export type GoalProgressKind = 'ok' | 'no_measurements' | 'pending' | GoalProgressUnavailableReason;

export interface UnifiedGoalItem {
  id: string;
  name: string;
  metricName: string;
  direction: GoalDirection;
  targetValue: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  startDate: string;
  deadline: string;
  rhythm: GoalRhythm;
  ownerPersonId: string;
  ownerName?: string;
  progressKind: GoalProgressKind;
  /** Null unless `progressKind === 'ok'`. */
  actualValue: number | null;
  expectedAtNow: number | null;
  projectedFinalValue: number | null;
  percentFilled: number | null;
  status: GoalPaceStatus | null;
  statusColor: 'green' | 'amber' | 'red' | null;
  isGoalMet: boolean | null;
  /** Calendar facts from the goal's own dates - real whether or not progress was measured. */
  elapsedFraction: number;
  daysRemaining: number;
}

export type GoalPaceItem = UnifiedGoalItem;

export interface GoalsCockpitSummary {
  totalGoalsCount: number;
  /** Goals whose progress was actually measured. The status counts below cover only these. */
  measuredGoalsCount: number;
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  /** Mean fill of measured goals; null when no goal was measured. */
  averageProgressPct: number | null;
  activeGoalsCount: number;
}

export interface CohortHeatmapRow {
  cohortMonth: string;
  cohortLabel: string;
  cohortSize: number;
  retentionByPeriod: Map<number, { retainedCount: number; retentionRatePercent: number; colorClass: string }>;
}

/**
 * One cumulative collected-revenue window. There is deliberately no target or pace here: nothing
 * in GrowthOS lets a project set a payback target, and the `windowDays * 1200` that used to fill
 * this slot was invented - and it was applied to real revenue, painting a pace bar against it.
 */
export interface PaybackVelocityItem {
  windowDays: 7 | 14 | 30 | 40;
  collectedRevenue: number;
}

export interface QualityCalibrationItem {
  tier: string;
  tierLabel: string;
  signups: number;
  payingSignups: number;
  /** Null when the tier had no signups - an undefined ratio, not 0%. */
  payingRatePercent: number | null;
  avgCollectedRevenue40d: number | null;
}

/** Why a warehouse-backed cockpit section has nothing to show. */
export type WarehouseSectionKind =
  | 'ok'
  | 'no_data'
  | 'warehouse_not_configured'
  | 'quota_exceeded'
  | 'not_yet_backed'
  | 'query_error';

/**
 * The funnel cockpit's headline figures.
 *
 * The retention / velocity / payback / dunning / churn fields are nullable because GrowthOS
 * has no source for any of them yet. They used to be the literals 64, 3.8, 48200, 82.4 and
 * 1.8 - written straight into the returned object, never derived from anything - and the
 * dashboard rendered them beside the two figures that are real. The two funnel figures are
 * null too unless the project's own funnel was measured.
 */
export interface FunnelGoalsExecutiveSummary {
  overallFunnelConversionPct: number | null;
  topFunnelDropOffPct: number | null;
  activeGoalsCount: number;
  goalsMeasuredCount: number;
  goalsOnTrackCount: number;
  avgMonth1RetentionPct: number | null;
  avgConversionVelocityDays: number | null;
  total40dPaybackUsd: number | null;
  dunningRecoveryRatePct: number | null;
  churnRatePct: number | null;
}

export interface ProactiveFunnelGoalRecommendation {
  id: string;
  category: 'funnel_dropoff' | 'goal_pace' | 'retention';
  title: string;
  description: string;
  beforeDiff: string;
  afterDiff: string;
  projectedImpact: string;
  actionType: 'funnel_optimization' | 'budget_change';
  targetId: string;
  targetLabel: string;
}

export interface FunnelGoalsCockpitData {
  summary: FunnelGoalsExecutiveSummary;
  /** Empty unless `funnelViewKind === 'ok'`. */
  funnelSteps: FunnelStepItem[];
  funnelViewKind: FunnelView['kind'];
  goals: UnifiedGoalItem[];
  goalsSummary: GoalsCockpitSummary;
  /** Empty unless `cohortViewKind === 'ok'` and the warehouse returned cohorts. */
  cohortRows: CohortHeatmapRow[];
  cohortPeriodNumbers: number[];
  cohortViewKind: CohortRetentionView['kind'];
  /** Empty unless `paybackViewKind === 'ok'`. */
  paybackVelocity: PaybackVelocityItem[];
  paybackViewKind: WarehouseSectionKind;
  /** Empty unless `calibrationViewKind === 'ok'`. */
  qualityCalibration: QualityCalibrationItem[];
  calibrationViewKind: WarehouseSectionKind;
  proactiveRecommendation: ProactiveFunnelGoalRecommendation | null;
}

const STATUS_COLOR_MAP: Record<GoalPaceStatus, 'green' | 'amber' | 'red'> = {
  on_track: 'green',
  at_risk: 'amber',
  off_track: 'red',
};

export function calculateDaysRemaining(deadline: string): number {
  const deadlineMs = Date.parse(deadline);
  const nowMs = Date.now();
  if (Number.isNaN(deadlineMs)) return 0;
  const diffDays = Math.ceil((deadlineMs - nowMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * A whole-number percentage of `part` out of `whole`, within 0..100.
 *
 * The bounds are a display guard, not the fix: funnel counts are sequential (a person counts at step N only
 * after steps 0..N, in order), so a step can never exceed the one before it and a real funnel never needs the
 * clamp. It exists so that if that invariant were ever broken again (B20 showed EasySign "150%" conversion and
 * "-0%" drop-offs off per-step event counts), the page shows a bounded number instead of an impossible one;
 * the query's own DuckDB proof (`funnel-steps-query.duckdb.test.ts`) is what guarantees the counts.
 */
export function boundedPercent(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  const percent = Math.round((part / whole) * 100);
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
}

/** The funnel's overall conversion - last step's people out of the first step's - as a 0..100 whole percentage. */
export function overallConversionPercent(steps: readonly { customerCount: number }[]): number {
  if (steps.length === 0) return 0;
  return boundedPercent(steps[steps.length - 1].customerCount, steps[0].customerCount);
}

/**
 * Conversion (off the first step) and drop-off (off the previous step) for each step, from the sequential
 * people counts `query_funnel` returns.
 */
export function calculateFunnelStepItems(
  rawSteps: { eventSchemaName?: string; stageKey: string; stepOrder: number; customerCount: number; conversionRateFromFirst?: number }[],
  stageLabelLookup?: (key: string) => string,
): FunnelStepItem[] {
  if (rawSteps.length === 0) return [];

  const sorted = [...rawSteps].sort((a, b) => a.stepOrder - b.stepOrder);
  const firstCount = sorted[0].customerCount;

  return sorted.map((step, idx) => {
    const prevCount = idx > 0 ? sorted[idx - 1].customerCount : step.customerCount;
    const conversionPercent =
      step.conversionRateFromFirst !== undefined
        ? boundedPercent(step.conversionRateFromFirst, 1)
        : boundedPercent(step.customerCount, firstCount);

    const dropOffPercent = idx > 0 ? boundedPercent(prevCount - step.customerCount, prevCount) : 0;

    const stageLabel = stageLabelLookup ? stageLabelLookup(step.stageKey) : step.stageKey;

    return {
      ...(step.eventSchemaName !== undefined ? { eventSchemaName: step.eventSchemaName } : {}),
      stageKey: step.stageKey,
      stageLabel,
      stepOrder: step.stepOrder,
      customerCount: step.customerCount,
      conversionPercent,
      dropOffPercent,
    };
  });
}

/**
 * The project's own funnel, or the reason there isn't one.
 *
 * A `null` outcome means the page's query threw, so it reports `query_error` - not `no_funnel`,
 * which would tell the user to go define a funnel they may already have.
 */
export function buildVisualFunnelData(
  outcome: FunnelStepsOutcome | null,
  stageLabelLookup?: (key: string) => string,
): VisualFunnelData {
  if (!outcome) {
    return { kind: 'query_error' };
  }
  const view = buildFunnelView(outcome);
  if (view.kind !== 'ok' || !outcome.ok) {
    return { kind: view.kind === 'ok' ? 'no_funnel' : view.kind };
  }

  const steps = calculateFunnelStepItems(outcome.steps, stageLabelLookup);
  const totalStarted = steps[0]?.customerCount ?? 0;
  const totalCompleted = steps[steps.length - 1]?.customerCount ?? 0;
  const overallConversion = overallConversionPercent(steps);

  let biggestDropOffStageKey: string | undefined;
  let biggestDropOffPercent = 0;

  for (let i = 1; i < steps.length; i++) {
    if (steps[i].dropOffPercent > biggestDropOffPercent) {
      biggestDropOffPercent = steps[i].dropOffPercent;
      biggestDropOffStageKey = steps[i].stageKey;
    }
  }

  return {
    kind: 'ok',
    totalStarted,
    totalCompleted,
    overallConversionPercent: overallConversion,
    biggestDropOffStageKey,
    biggestDropOffPercent,
    steps,
  };
}

/** The progress fields of an item whose progress was not measured. */
const UNMEASURED_PROGRESS = {
  actualValue: null,
  expectedAtNow: null,
  projectedFinalValue: null,
  percentFilled: null,
  status: null,
  statusColor: null,
  isGoalMet: null,
} as const;

/**
 * Builds unified goal items from the project's own goals and their measured progress.
 *
 * A project with no goals gets an empty list - never sample goals. (It used to get five, with
 * invented owners such as "Sarah Jenkins (Growth Lead)" and actuals scaled by a hash of the
 * project id.) A goal whose progress was not measured carries `progressKind` saying why and null
 * figures; it used to be shown with an actual of 0 and a pace computed against that 0.
 */
export function buildUnifiedGoalsData(
  rawGoals: GoalModel[],
  outcomesByGoalId?: Map<string, GoalProgressOutcome>,
  personNameById?: Map<string, string>,
): { items: UnifiedGoalItem[]; summary: GoalsCockpitSummary } {
  const todayStr = new Date().toISOString().slice(0, 10);

  const items: UnifiedGoalItem[] = rawGoals.map((goal) => {
    const outcome = outcomesByGoalId?.get(goal.id);
    const elapsed = computeElapsedFraction(goal.start_date, goal.deadline, todayStr, goal.rhythm);

    const base = {
      id: goal.id,
      name: goal.name,
      metricName: goal.metric_name,
      direction: goal.direction,
      targetValue: goal.target_value,
      rangeMin: goal.range_min,
      rangeMax: goal.range_max,
      startDate: goal.start_date,
      deadline: goal.deadline,
      rhythm: goal.rhythm,
      ownerPersonId: goal.owner_person_id,
      ownerName: personNameById?.get(goal.owner_person_id) ?? goal.owner_person_id,
      elapsedFraction: elapsed,
      daysRemaining: calculateDaysRemaining(goal.deadline),
    };

    if (!outcome) {
      // The page's per-goal query threw, so nothing was measured.
      return { ...base, progressKind: 'query_error', ...UNMEASURED_PROGRESS };
    }
    if (!outcome.ok) {
      return { ...base, progressKind: outcome.reason, ...UNMEASURED_PROGRESS };
    }
    if (!outcome.hasMeasurements) {
      return { ...base, progressKind: 'no_measurements', ...UNMEASURED_PROGRESS };
    }

    const status = outcome.progress.status;
    return {
      ...base,
      progressKind: 'ok',
      actualValue: outcome.actualValue,
      expectedAtNow: outcome.progress.expectedAtNow,
      projectedFinalValue: outcome.progress.projectedFinalValue,
      percentFilled: Math.min(100, Math.max(0, Math.round(outcome.progress.progressRatio * 100))),
      status,
      statusColor: STATUS_COLOR_MAP[status],
      isGoalMet: outcome.progress.isGoalMet,
    };
  });

  return { items, summary: summarizeGoals(items) };
}

/** Summary counts over real goals; pace counts cover only the goals that were measured. */
export function summarizeGoals(items: readonly UnifiedGoalItem[]): GoalsCockpitSummary {
  const measured = items.filter((i) => i.progressKind === 'ok');
  const averageProgressPct =
    measured.length > 0
      ? Math.round(measured.reduce((sum, item) => sum + (item.percentFilled ?? 0), 0) / measured.length)
      : null;

  return {
    totalGoalsCount: items.length,
    measuredGoalsCount: measured.length,
    onTrackCount: measured.filter((i) => i.status === 'on_track').length,
    atRiskCount: measured.filter((i) => i.status === 'at_risk').length,
    offTrackCount: measured.filter((i) => i.status === 'off_track').length,
    averageProgressPct,
    activeGoalsCount: items.length,
  };
}

export function getHeatmapCellColor(ratePct: number): string {
  if (ratePct >= 80) return 'bg-emerald-500 text-white font-bold';
  if (ratePct >= 60) return 'bg-emerald-500/70 text-white font-semibold';
  if (ratePct >= 40) return 'bg-emerald-500/35 text-emerald-950 dark:text-emerald-100 font-medium';
  if (ratePct >= 20) return 'bg-amber-500/30 text-amber-950 dark:text-amber-100 font-medium';
  if (ratePct > 0) return 'bg-rose-500/20 text-rose-950 dark:text-rose-100';
  return 'bg-muted/30 text-muted-foreground';
}

/**
 * Payback windows as measured, or why there are none.
 *
 * Windows that are all zero are reported as `no_data`: `getPaybackOverviewForProject` sums
 * metric rows, and a sum over no rows is 0, so all-zero windows are what a project with nothing
 * landed yet returns. "No collected revenue has landed yet" is true in both readings; "$0" would
 * state a measurement that may never have happened.
 */
export function buildPaybackVelocity(outcome: PaybackOverviewOutcome | null): {
  kind: WarehouseSectionKind;
  items: PaybackVelocityItem[];
} {
  if (!outcome) return { kind: 'query_error', items: [] };
  if (!outcome.ok) return { kind: outcome.reason, items: [] };

  const items = outcome.windows
    .filter((w): w is PaybackVelocityItem => [7, 14, 30, 40].includes(w.windowDays))
    .map((w) => ({ windowDays: w.windowDays, collectedRevenue: w.collectedRevenue }));

  if (items.length === 0 || items.every((w) => w.collectedRevenue === 0)) {
    return { kind: 'no_data', items: [] };
  }
  return { kind: 'ok', items };
}

/** Quality-tier calibration as measured, or why there is none. */
export function buildQualityCalibration(outcome: QualityCalibrationBreakdownOutcome | null): {
  kind: WarehouseSectionKind;
  items: QualityCalibrationItem[];
} {
  if (!outcome) return { kind: 'query_error', items: [] };
  if (!outcome.ok) return { kind: outcome.reason, items: [] };
  if (outcome.tiers.length === 0 || outcome.tiers.every((t) => t.signups === 0)) {
    return { kind: 'no_data', items: [] };
  }

  return {
    kind: 'ok',
    items: outcome.tiers.map((t) => ({
      tier: t.qualityTier,
      tierLabel: t.qualityTier.charAt(0).toUpperCase() + t.qualityTier.slice(1),
      signups: t.signups,
      payingSignups: t.payingSignups,
      payingRatePercent: t.payingRate !== null ? Math.round(t.payingRate * 100) : null,
      avgCollectedRevenue40d: t.avgCollectedRevenue40d !== null ? Math.round(t.avgCollectedRevenue40d) : null,
    })),
  };
}

function buildCohortHeatmap(outcome: CohortRetentionOutcome | null): {
  kind: CohortRetentionView['kind'];
  rows: CohortHeatmapRow[];
  periodNumbers: number[];
} {
  // A null outcome means the page's query threw - an error, not "warehouse not configured".
  if (!outcome) return { kind: 'query_error', rows: [], periodNumbers: [] };

  const view = buildCohortRetentionView(outcome);
  if (view.kind !== 'ok' || view.cohorts.length === 0) {
    return { kind: view.kind, rows: [], periodNumbers: [] };
  }

  const rows = view.cohorts.map((cohort) => {
    const retentionMap = new Map<number, { retainedCount: number; retentionRatePercent: number; colorClass: string }>();
    for (const p of cohort.periods) {
      retentionMap.set(p.periodNumber, {
        retainedCount: p.retainedCount,
        retentionRatePercent: p.retentionRatePercent,
        colorClass: getHeatmapCellColor(p.retentionRatePercent),
      });
    }
    return {
      cohortMonth: cohort.cohortMonth,
      cohortLabel: new Date(cohort.cohortMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      cohortSize: cohort.cohortSize,
      retentionByPeriod: retentionMap,
    };
  });

  return { kind: 'ok', rows, periodNumbers: view.periodNumbers };
}

export function buildFunnelGoalsCockpitData(params: {
  funnelOutcome: FunnelStepsOutcome | null;
  goals: GoalModel[];
  goalOutcomes?: Map<string, GoalProgressOutcome>;
  personNameById?: Map<string, string>;
  cohortOutcome?: CohortRetentionOutcome | null;
  paybackOutcome?: PaybackOverviewOutcome | null;
  calibrationOutcome?: QualityCalibrationBreakdownOutcome | null;
}): FunnelGoalsCockpitData {
  const {
    funnelOutcome,
    goals,
    goalOutcomes = new Map(),
    personNameById = new Map(),
    cohortOutcome = null,
    paybackOutcome = null,
    calibrationOutcome = null,
  } = params;

  // 1. Funnel - the project's own, or nothing.
  const visualFunnel = buildVisualFunnelData(funnelOutcome);
  const funnelSteps = visualFunnel.kind === 'ok' ? visualFunnel.steps : [];

  // 2. Goals & summary - the project's own, or an empty list.
  const { items: goalItems, summary: goalsSummary } = buildUnifiedGoalsData(goals, goalOutcomes, personNameById);

  // 3. Cohort retention, payback and calibration - measured, or a kind saying why not.
  const cohort = buildCohortHeatmap(cohortOutcome);
  const payback = buildPaybackVelocity(paybackOutcome);
  const calibration = buildQualityCalibration(calibrationOutcome);

  // 4. Executive summary - funnel figures only from a measured funnel with entrants.
  const overallConversionPct =
    visualFunnel.kind === 'ok' && visualFunnel.totalStarted > 0 ? visualFunnel.overallConversionPercent : null;
  const topFunnelDropOffPct = visualFunnel.kind === 'ok' ? visualFunnel.biggestDropOffPercent : null;

  /*
    Only raised from the project's own funnel.

    This used to be a fixed recommendation - "62% of users drop off between Sent and Viewed" -
    returned unconditionally, including for a project whose funnel was the zero-config sample.
    The dashboard puts an Apply button on it that POSTs to the real automation endpoint, so a
    recommendation needs a real funnel with a real worst step; without one it is null.
  */
  const worstStep =
    funnelSteps.length > 0 ? [...funnelSteps].sort((a, b) => b.dropOffPercent - a.dropOffPercent)[0] : null;

  const proactiveRecommendation: ProactiveFunnelGoalRecommendation | null =
    worstStep && worstStep.dropOffPercent > 0
      ? {
          id: `rec-funnel-${worstStep.stageKey}`,
          category: 'funnel_dropoff',
          title: `Largest drop-off at ${worstStep.stageLabel}`,
          description: `${worstStep.dropOffPercent}% of the visitors who reach "${worstStep.stageLabel}" do not continue past it.`,
          beforeDiff: `${worstStep.dropOffPercent}% drop-off`,
          afterDiff: 'Retargeting campaign draft',
          // No projected impact: projecting one needs a model of the intervention's effect.
          projectedImpact: '',
          actionType: 'funnel_optimization',
          targetId: `funnel_${worstStep.stageKey}`,
          targetLabel: worstStep.stageLabel,
        }
      : null;

  return {
    summary: {
      overallFunnelConversionPct: overallConversionPct,
      topFunnelDropOffPct,
      activeGoalsCount: goalsSummary.totalGoalsCount,
      goalsMeasuredCount: goalsSummary.measuredGoalsCount,
      goalsOnTrackCount: goalsSummary.onTrackCount,
      // Each of these needs a source that does not exist yet - see the interface doc comment.
      avgMonth1RetentionPct: null,
      avgConversionVelocityDays: null,
      total40dPaybackUsd: null,
      dunningRecoveryRatePct: null,
      churnRatePct: null,
    },
    funnelSteps,
    funnelViewKind: visualFunnel.kind,
    goals: goalItems,
    goalsSummary,
    cohortRows: cohort.rows,
    cohortPeriodNumbers: cohort.periodNumbers,
    cohortViewKind: cohort.kind,
    paybackVelocity: payback.items,
    paybackViewKind: payback.kind,
    qualityCalibration: calibration.items,
    calibrationViewKind: calibration.kind,
    proactiveRecommendation,
  };
}
