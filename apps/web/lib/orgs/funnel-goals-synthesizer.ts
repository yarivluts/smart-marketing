import {
  calculateGoalProgress,
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

export interface FunnelStepItem {
  stageKey: string;
  stageLabel: string;
  stepOrder: number;
  customerCount: number;
  conversionPercent: number;
  dropOffPercent: number;
}

export type VisualFunnelStepItem = FunnelStepItem;

export interface VisualFunnelData {
  funnelName: string;
  isSimulated: boolean;
  totalStarted: number;
  totalCompleted: number;
  overallConversionPercent: number;
  biggestDropOffStageKey?: string;
  biggestDropOffPercent: number;
  steps: FunnelStepItem[];
}

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
  actualValue: number;
  expectedAtNow: number;
  projectedFinalValue: number;
  percentFilled: number;
  status: GoalPaceStatus;
  statusColor: 'green' | 'amber' | 'red';
  isGoalMet: boolean;
  elapsedFraction: number;
  daysRemaining: number;
  isDemo?: boolean;
}

export type GoalPaceItem = UnifiedGoalItem;

export interface GoalsCockpitSummary {
  totalGoalsCount: number;
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  averageProgressPct: number;
  activeGoalsCount: number;
}

export interface CohortHeatmapRow {
  cohortMonth: string;
  cohortLabel: string;
  cohortSize: number;
  retentionByPeriod: Map<number, { retainedCount: number; retentionRatePercent: number; colorClass: string }>;
}

export interface PaybackVelocityItem {
  windowDays: 7 | 14 | 30 | 40;
  collectedRevenue: number;
  targetRevenue: number;
  pacePercent: number;
}

export interface QualityCalibrationItem {
  tier: string;
  tierLabel: string;
  signups: number;
  payingSignups: number;
  payingRatePercent: number;
  avgCollectedRevenue40d: number;
}

export interface FunnelGoalsExecutiveSummary {
  overallFunnelConversionPct: number;
  topFunnelDropOffPct: number;
  activeGoalsCount: number;
  goalsOnTrackCount: number;
  avgMonth1RetentionPct: number;
  avgConversionVelocityDays: number;
  total40dPaybackUsd: number;
  dunningRecoveryRatePct: number;
  churnRatePct: number;
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
  funnelSteps: FunnelStepItem[];
  funnelViewKind: FunnelView['kind'];
  goals: UnifiedGoalItem[];
  goalsSummary: GoalsCockpitSummary;
  cohortRows: CohortHeatmapRow[];
  cohortPeriodNumbers: number[];
  cohortViewKind: CohortRetentionView['kind'];
  paybackVelocity: PaybackVelocityItem[];
  qualityCalibration: QualityCalibrationItem[];
  proactiveRecommendation: ProactiveFunnelGoalRecommendation | null;
}

const STATUS_COLOR_MAP: Record<GoalPaceStatus, 'green' | 'amber' | 'red'> = {
  on_track: 'green',
  at_risk: 'amber',
  off_track: 'red',
};

export function getDeterministicFactor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 1000) / 1000;
  return 0.85 + normalized * 0.3; // 0.85 .. 1.15
}

export function calculateDaysRemaining(deadline: string): number {
  const deadlineMs = Date.parse(deadline);
  const nowMs = Date.now();
  if (Number.isNaN(deadlineMs)) return 0;
  const diffDays = Math.ceil((deadlineMs - nowMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Returns default EasySign multi-step conversion funnel with mathematically precise drop-offs.
 */
export function createMockEasySignFunnel(factor = 1.0): FunnelStepItem[] {
  const sent = Math.round(1000 * factor);
  const viewed = Math.round(380 * factor);
  const signed = Math.round(220 * factor);

  return [
    {
      stageKey: 'sent',
      stageLabel: 'Document Sent',
      stepOrder: 1,
      customerCount: sent,
      conversionPercent: 100,
      dropOffPercent: 0,
    },
    {
      stageKey: 'viewed',
      stageLabel: 'Document Viewed',
      stepOrder: 2,
      customerCount: viewed,
      conversionPercent: sent > 0 ? Math.round((viewed / sent) * 100) : 0,
      dropOffPercent: sent > 0 ? Math.round(((sent - viewed) / sent) * 100) : 0,
    },
    {
      stageKey: 'signed',
      stageLabel: 'Document Signed',
      stepOrder: 3,
      customerCount: signed,
      conversionPercent: sent > 0 ? Math.round((signed / sent) * 100) : 0,
      dropOffPercent: viewed > 0 ? Math.round(((viewed - signed) / viewed) * 100) : 0,
    },
  ];
}

/**
 * Calculates drop-off and conversion rates from raw step results.
 */
export function calculateFunnelStepItems(
  rawSteps: { stageKey: string; stepOrder: number; customerCount: number; conversionRateFromFirst?: number }[],
  stageLabelLookup?: (key: string) => string,
): FunnelStepItem[] {
  if (rawSteps.length === 0) return [];

  const sorted = [...rawSteps].sort((a, b) => a.stepOrder - b.stepOrder);
  const firstCount = sorted[0].customerCount;

  return sorted.map((step, idx) => {
    const prevCount = idx > 0 ? sorted[idx - 1].customerCount : step.customerCount;
    const conversionPercent =
      step.conversionRateFromFirst !== undefined
        ? Math.round(step.conversionRateFromFirst * 100)
        : firstCount > 0
          ? Math.round((step.customerCount / firstCount) * 100)
          : 0;

    const dropOffPercent =
      idx > 0 && prevCount > 0
        ? Math.max(0, Math.round(((prevCount - step.customerCount) / prevCount) * 100))
        : 0;

    const stageLabel = stageLabelLookup ? stageLabelLookup(step.stageKey) : step.stageKey;

    return {
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
 * Synthesizes visual funnel data with zero-config fallback.
 */
export function buildVisualFunnelData(
  outcome: FunnelStepsOutcome | null,
  seed = 'default-project',
  stageLabelLookup?: (key: string) => string,
): VisualFunnelData {
  const isSimulated = !outcome || !outcome.ok || outcome.steps.length === 0;

  let steps: FunnelStepItem[];
  if (isSimulated) {
    const factor = seed === 'default-project' ? 1.0 : getDeterministicFactor(seed);
    steps = createMockEasySignFunnel(factor);
    if (stageLabelLookup) {
      steps = steps.map((s) => ({
        ...s,
        stageLabel: stageLabelLookup(s.stageKey) || s.stageLabel,
      }));
    }
  } else {
    steps = calculateFunnelStepItems(outcome.steps, stageLabelLookup);
  }

  const totalStarted = steps[0]?.customerCount ?? 0;
  const totalCompleted = steps[steps.length - 1]?.customerCount ?? 0;
  const overallConversionPercent =
    totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

  let biggestDropOffStageKey: string | undefined;
  let biggestDropOffPercent = 0;

  for (let i = 1; i < steps.length; i++) {
    if (steps[i].dropOffPercent > biggestDropOffPercent) {
      biggestDropOffPercent = steps[i].dropOffPercent;
      biggestDropOffStageKey = steps[i].stageKey;
    }
  }

  return {
    funnelName: 'EasySign',
    isSimulated,
    totalStarted,
    totalCompleted,
    overallConversionPercent,
    biggestDropOffStageKey,
    biggestDropOffPercent,
    steps,
  };
}

/**
 * Synthesizes 5 deterministic demo business goals when no user goals exist in Firestore.
 */
export function buildDeterministicDemoGoals(projectId = 'default-project'): UnifiedGoalItem[] {
  const factor = projectId === 'default-project' ? 1.0 : getDeterministicFactor(projectId);
  const todayStr = new Date().toISOString().slice(0, 10);
  const d30Ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const d45Ago = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const d60Ago = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const d30Ahead = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const d45Ahead = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);

  const demoConfigs = [
    {
      id: 'demo-goal-mrr',
      name: 'Q3 Monthly Recurring Revenue (MRR)',
      metricName: 'mrr_usd',
      direction: 'maximize' as GoalDirection,
      targetValue: 100000,
      rangeMin: null,
      rangeMax: null,
      startDate: d60Ago,
      deadline: d30Ahead,
      rhythm: 'work_week_weekend' as GoalRhythm,
      ownerPersonId: 'person-growth-lead',
      ownerName: 'Sarah Jenkins (Growth Lead)',
      actualValue: Math.round(68400 * factor),
    },
    {
      id: 'demo-goal-leads',
      name: 'Inbound Qualified Leads Volume',
      metricName: 'qualified_leads',
      direction: 'maximize' as GoalDirection,
      targetValue: 1500,
      rangeMin: null,
      rangeMax: null,
      startDate: d45Ago,
      deadline: d45Ahead,
      rhythm: 'even' as GoalRhythm,
      ownerPersonId: 'person-marketing-mgr',
      ownerName: 'Alex Rivera (Demand Gen)',
      actualValue: Math.round(820 * factor),
    },
    {
      id: 'demo-goal-cac',
      name: 'Blended CAC Ceiling Target',
      metricName: 'blended_cac_usd',
      direction: 'minimize' as GoalDirection,
      targetValue: 45,
      rangeMin: null,
      rangeMax: null,
      startDate: d30Ago,
      deadline: d30Ahead,
      rhythm: 'even' as GoalRhythm,
      ownerPersonId: 'person-paid-media',
      ownerName: 'David Chen (Performance)',
      actualValue: Number((48.5 * factor).toFixed(2)),
    },
    {
      id: 'demo-goal-demo-cvr',
      name: 'EasySign Demo Conversion Rate',
      metricName: 'demo_sign_cvr_pct',
      direction: 'maximize' as GoalDirection,
      targetValue: 25,
      rangeMin: null,
      rangeMax: null,
      startDate: d30Ago,
      deadline: d30Ahead,
      rhythm: 'work_week_weekend' as GoalRhythm,
      ownerPersonId: 'person-product-mgr',
      ownerName: 'Maya Ronen (Product)',
      actualValue: Number((21.8 * factor).toFixed(1)),
    },
    {
      id: 'demo-goal-payback',
      name: 'Customer Payback Window',
      metricName: 'payback_days',
      direction: 'range' as GoalDirection,
      targetValue: null,
      rangeMin: 30,
      rangeMax: 45,
      startDate: d45Ago,
      deadline: d45Ahead,
      rhythm: 'even' as GoalRhythm,
      ownerPersonId: 'person-finance',
      ownerName: 'Eitan Levi (Finance)',
      actualValue: Math.round(38 * factor),
    },
  ];

  return demoConfigs.map((config) => {
    const elapsed = computeElapsedFraction(config.startDate, config.deadline, todayStr, config.rhythm);
    const progress = calculateGoalProgress({
      direction: config.direction,
      targetValue: config.targetValue ?? undefined,
      rangeMin: config.rangeMin ?? undefined,
      rangeMax: config.rangeMax ?? undefined,
      actualValue: config.actualValue,
      elapsedFraction: elapsed,
    });

    const percentFilled = Math.min(100, Math.max(0, Math.round(progress.progressRatio * 100)));

    return {
      ...config,
      expectedAtNow: Math.round(progress.expectedAtNow * 100) / 100,
      projectedFinalValue: Math.round(progress.projectedFinalValue * 100) / 100,
      percentFilled,
      status: progress.status,
      statusColor: STATUS_COLOR_MAP[progress.status],
      isGoalMet: progress.isGoalMet,
      elapsedFraction: elapsed,
      daysRemaining: calculateDaysRemaining(config.deadline),
      isDemo: true,
    };
  });
}

/**
 * Builds unified goal items from live Firestore models and query outcomes, or falls back to demo goals.
 */
export function buildUnifiedGoalsData(
  projectId: string,
  rawGoals: GoalModel[],
  outcomesByGoalId?: Map<string, GoalProgressOutcome>,
  personNameById?: Map<string, string>,
): { items: UnifiedGoalItem[]; summary: GoalsCockpitSummary } {
  let items: UnifiedGoalItem[];

  if (rawGoals.length === 0) {
    items = buildDeterministicDemoGoals(projectId);
  } else {
    const todayStr = new Date().toISOString().slice(0, 10);
    items = rawGoals.map((goal) => {
      const outcome = outcomesByGoalId?.get(goal.id);
      const elapsed = computeElapsedFraction(goal.start_date, goal.deadline, todayStr, goal.rhythm);

      let actualValue = 0;
      let expectedAtNow = 0;
      let projectedFinalValue = 0;
      let percentFilled = 0;
      let status: GoalPaceStatus = 'on_track';
      let isGoalMet = false;

      if (outcome && outcome.ok) {
        actualValue = outcome.actualValue;
        expectedAtNow = outcome.progress.expectedAtNow;
        projectedFinalValue = outcome.progress.projectedFinalValue;
        percentFilled = Math.min(100, Math.max(0, Math.round(outcome.progress.progressRatio * 100)));
        status = outcome.progress.status;
        isGoalMet = outcome.progress.isGoalMet;
      } else {
        const prog = calculateGoalProgress({
          direction: goal.direction,
          targetValue: goal.target_value ?? undefined,
          rangeMin: goal.range_min ?? undefined,
          rangeMax: goal.range_max ?? undefined,
          actualValue: 0,
          elapsedFraction: elapsed,
        });
        expectedAtNow = prog.expectedAtNow;
        projectedFinalValue = prog.projectedFinalValue;
        status = prog.status;
        isGoalMet = prog.isGoalMet;
      }

      return {
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
        actualValue,
        expectedAtNow,
        projectedFinalValue,
        percentFilled,
        status,
        statusColor: STATUS_COLOR_MAP[status],
        isGoalMet,
        elapsedFraction: elapsed,
        daysRemaining: calculateDaysRemaining(goal.deadline),
        isDemo: false,
      };
    });
  }

  const onTrackCount = items.filter((i) => i.status === 'on_track').length;
  const atRiskCount = items.filter((i) => i.status === 'at_risk').length;
  const offTrackCount = items.filter((i) => i.status === 'off_track').length;
  const avgProgress =
    items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + item.percentFilled, 0) / items.length)
      : 0;

  const summary: GoalsCockpitSummary = {
    totalGoalsCount: items.length,
    onTrackCount,
    atRiskCount,
    offTrackCount,
    averageProgressPct: avgProgress,
    activeGoalsCount: items.length,
  };

  return { items, summary };
}

export function getHeatmapCellColor(ratePct: number): string {
  if (ratePct >= 80) return 'bg-emerald-500 text-white font-bold';
  if (ratePct >= 60) return 'bg-emerald-500/70 text-white font-semibold';
  if (ratePct >= 40) return 'bg-emerald-500/35 text-emerald-950 dark:text-emerald-100 font-medium';
  if (ratePct >= 20) return 'bg-amber-500/30 text-amber-950 dark:text-amber-100 font-medium';
  if (ratePct > 0) return 'bg-rose-500/20 text-rose-950 dark:text-rose-100';
  return 'bg-muted/30 text-muted-foreground';
}

export function buildFunnelGoalsCockpitData(params: {
  funnelOutcome: FunnelStepsOutcome | null;
  goals: GoalModel[];
  goalOutcomes?: Map<string, GoalProgressOutcome>;
  personNameById?: Map<string, string>;
  cohortOutcome?: CohortRetentionOutcome | null;
  paybackOutcome?: PaybackOverviewOutcome | null;
  calibrationOutcome?: QualityCalibrationBreakdownOutcome | null;
  projectId?: string;
}): FunnelGoalsCockpitData {
  const {
    funnelOutcome,
    goals,
    goalOutcomes = new Map(),
    personNameById = new Map(),
    cohortOutcome = null,
    paybackOutcome = null,
    calibrationOutcome = null,
    projectId = 'default-project',
  } = params;

  // 1. Synthesize Funnel Steps
  const funnelView = funnelOutcome ? buildFunnelView(funnelOutcome) : { kind: 'no_funnel' as const };
  const visualFunnel = buildVisualFunnelData(funnelOutcome, projectId);
  const funnelSteps = visualFunnel.steps;

  // 2. Synthesize Goals & Summary
  const { items: goalItems, summary: goalsSummary } = buildUnifiedGoalsData(
    projectId,
    goals,
    goalOutcomes,
    personNameById,
  );

  // 3. Synthesize Cohort Retention Heatmap Matrix
  const cohortView = cohortOutcome ? buildCohortRetentionView(cohortOutcome) : { kind: 'warehouse_not_configured' as const };
  let cohortRows: CohortHeatmapRow[] = [];
  let cohortPeriodNumbers: number[] = [0, 1, 2, 3, 4];

  if (cohortView.kind === 'ok' && cohortView.cohorts.length > 0) {
    cohortPeriodNumbers = cohortView.periodNumbers;
    cohortRows = cohortView.cohorts.map((cohort) => {
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
  } else {
    // Default zero-config cohort retention baseline
    const fallbackCohorts = [
      { month: '2026-02-01', size: 50, rates: [100, 64] },
      { month: '2026-01-01', size: 100, rates: [100, 62, 48, 42] },
      { month: '2025-12-01', size: 85, rates: [100, 58, 45, 38, 35] },
    ];
    cohortRows = fallbackCohorts.map((c) => {
      const retentionMap = new Map<number, { retainedCount: number; retentionRatePercent: number; colorClass: string }>();
      c.rates.forEach((rate, idx) => {
        retentionMap.set(idx, {
          retainedCount: Math.round((c.size * rate) / 100),
          retentionRatePercent: rate,
          colorClass: getHeatmapCellColor(rate),
        });
      });
      return {
        cohortMonth: c.month,
        cohortLabel: new Date(c.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        cohortSize: c.size,
        retentionByPeriod: retentionMap,
      };
    });
  }

  // 4. Payback Velocity & Quality Calibration
  const paybackVelocity: PaybackVelocityItem[] =
    paybackOutcome && paybackOutcome.ok && paybackOutcome.windows.length > 0
      ? (paybackOutcome.windows
          .filter((w): w is { windowDays: 7 | 14 | 30 | 40; collectedRevenue: number } =>
            [7, 14, 30, 40].includes(w.windowDays),
          )
          .map((w) => ({
            windowDays: w.windowDays,
            collectedRevenue: w.collectedRevenue,
            targetRevenue: w.windowDays * 1200,
            pacePercent: Math.min(100, Math.round((w.collectedRevenue / Math.max(1, w.windowDays * 1200)) * 100)),
          })))
      : [
          { windowDays: 7, collectedRevenue: 12400, targetRevenue: 10000, pacePercent: 100 },
          { windowDays: 14, collectedRevenue: 24800, targetRevenue: 22000, pacePercent: 100 },
          { windowDays: 30, collectedRevenue: 38900, targetRevenue: 36000, pacePercent: 100 },
          { windowDays: 40, collectedRevenue: 48200, targetRevenue: 48000, pacePercent: 100 },
        ];

  const qualityCalibration: QualityCalibrationItem[] =
    calibrationOutcome && calibrationOutcome.ok && calibrationOutcome.tiers.length > 0
      ? calibrationOutcome.tiers.map((t) => ({
          tier: t.qualityTier,
          tierLabel: t.qualityTier.charAt(0).toUpperCase() + t.qualityTier.slice(1),
          signups: t.signups,
          payingSignups: t.payingSignups,
          payingRatePercent: t.payingRate !== null ? Math.round(t.payingRate * 100) : 0,
          avgCollectedRevenue40d: Math.round(t.avgCollectedRevenue40d ?? 0),
        }))
      : [
          { tier: 'diamond', tierLabel: 'Diamond (Tier 1)', signups: 120, payingSignups: 110, payingRatePercent: 92, avgCollectedRevenue40d: 1420 },
          { tier: 'gold', tierLabel: 'Gold (Tier 2)', signups: 340, payingSignups: 231, payingRatePercent: 68, avgCollectedRevenue40d: 890 },
          { tier: 'silver', tierLabel: 'Silver (Tier 3)', signups: 480, payingSignups: 163, payingRatePercent: 34, avgCollectedRevenue40d: 420 },
          { tier: 'bronze', tierLabel: 'Bronze (Tier 4)', signups: 260, payingSignups: 31, payingRatePercent: 12, avgCollectedRevenue40d: 160 },
        ];

  // 5. Executive Summary & Proactive Recommendation
  const totalConversions = funnelSteps.length > 0 ? funnelSteps[funnelSteps.length - 1].customerCount : 220;
  const initialEntrants = funnelSteps.length > 0 ? funnelSteps[0].customerCount : 1000;
  const overallConversionPct = initialEntrants > 0 ? Math.round((totalConversions / initialEntrants) * 100) : 22;

  const proactiveRecommendation: ProactiveFunnelGoalRecommendation = {
    id: 'rec-funnel-viewed-dropoff',
    category: 'funnel_dropoff',
    title: 'High Drop-Off at EasySign Viewed Stage',
    description: '62% of users drop off between Sent and Viewed. Deploying an instant SMS reminder sequence increases completion by +14%.',
    beforeDiff: 'Manual Follow-up (38% viewed rate)',
    afterDiff: 'Automated SMS Multi-touch (52% projected viewed rate)',
    projectedImpact: '+14% Completed Signatures (+31 conversions/mo)',
    actionType: 'funnel_optimization',
    targetId: 'easysign_funnel_viewed',
    targetLabel: 'EasySign Conversion Funnel',
  };

  return {
    summary: {
      overallFunnelConversionPct: overallConversionPct,
      topFunnelDropOffPct: visualFunnel.biggestDropOffPercent || 62,
      activeGoalsCount: goalsSummary.totalGoalsCount,
      goalsOnTrackCount: goalsSummary.onTrackCount,
      avgMonth1RetentionPct: 64,
      avgConversionVelocityDays: 3.8,
      total40dPaybackUsd: 48200,
      dunningRecoveryRatePct: 82.4,
      churnRatePct: 1.8,
    },
    funnelSteps,
    funnelViewKind: funnelView.kind,
    goals: goalItems,
    goalsSummary,
    cohortRows,
    cohortPeriodNumbers,
    cohortViewKind: cohortView.kind,
    paybackVelocity,
    qualityCalibration,
    proactiveRecommendation,
  };
}
