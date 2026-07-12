/**
 * The marketing/SaaS funnel-stage vocabulary {@link proposeFunnelSteps} classifies registered event
 * schemas into (KAN-68 AC: "AI proposes funnel/step mapping from discovered data"). `other` is not a
 * real stage — it's the bucket for an event name the heuristic couldn't confidently place anywhere,
 * always sorted last.
 */
export const FUNNEL_STAGE_KEYS = [
  'awareness',
  'signup',
  'activation',
  'trial',
  'checkout',
  'conversion',
  'retention',
  'churn',
  'other',
] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGE_KEYS)[number];

export function isFunnelStageKey(value: string): value is FunnelStageKey {
  return (FUNNEL_STAGE_KEYS as readonly string[]).includes(value);
}

/**
 * One registered event schema, proposed as one step of the project's funnel. `confidence` is 0..1,
 * purely to rank/display — not a probability from a real model, since today's proposer is a
 * deterministic keyword heuristic (see `suggest.ts`'s own doc comment), the same posture
 * `MappingSuggestion.confidence` (KAN-55) already established for its own heuristic proposer.
 * `order` is this step's position in the proposed funnel (0-based, ascending) — stable once returned,
 * so a caller can render steps top-to-bottom without re-deriving the sort.
 */
export interface FunnelStepSuggestion {
  eventSchemaName: string;
  stageKey: FunnelStageKey;
  confidence: number;
  order: number;
}
