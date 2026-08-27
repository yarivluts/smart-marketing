import type { FunnelStepResult, FunnelStepsOutcome } from '@growthos/firebase-orm-models';
import type { FunnelStageKey } from '@growthos/shared';

/** One stage of the Funnel page's rendered conversion table — `conversionPercent` is a whole-number
 * percentage (`Math.round(conversionRateFromFirst * 100)`), the same "round for display, keep the raw
 * fraction out of the view" posture `demos/page.tsx`'s own `formatShowRate` establishes for the same
 * kind of ratio. */
export interface FunnelStepView {
  stageKey: FunnelStageKey;
  stepOrder: number;
  customerCount: number;
  conversionPercent: number;
}

export function toFunnelStepView(step: FunnelStepResult): FunnelStepView {
  return {
    stageKey: step.stageKey as FunnelStageKey,
    stepOrder: step.stepOrder,
    customerCount: step.customerCount,
    conversionPercent: Math.round(step.conversionRateFromFirst * 100),
  };
}

/**
 * Mirrors `CustomerSearchView`/`SegmentMemberListView`'s exact ok/degraded-kind split — the Funnel
 * page degrades the same honest way rather than crashing. `no_funnel` is a fourth, non-error kind:
 * `queryProjectFunnelStepsForAdmin` returns `{ ok: true, steps: [] }` (never a warehouse call at all)
 * when the project hasn't confirmed a funnel yet in onboarding, which reads as "nothing to show yet",
 * not a failure.
 */
export type FunnelView =
  | { kind: 'ok'; steps: FunnelStepView[] }
  | { kind: 'no_funnel' }
  | { kind: 'warehouse_not_configured' }
  | { kind: 'quota_exceeded' }
  | { kind: 'query_error' };

export function buildFunnelView(outcome: FunnelStepsOutcome): FunnelView {
  if (!outcome.ok) {
    return { kind: outcome.reason };
  }
  if (outcome.steps.length === 0) {
    return { kind: 'no_funnel' };
  }
  return { kind: 'ok', steps: outcome.steps.map(toFunnelStepView) };
}
