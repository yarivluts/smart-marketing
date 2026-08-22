import type { SegmentFilterCondition } from '../segments/segment-filter';

/**
 * The high-value-list vocabulary {@link proposeSegmentSuggestions} classifies a project's registered
 * boolean entity fields into (KAN-81, plan `14 §Gap 5`: "AI proposes new high-value lists"). A small,
 * curated set of recurring SaaS/marketing work-list concepts — not a real taxonomy, the same
 * "buildable-today, closed vocabulary" posture `FunnelStageKey` (KAN-68) already establishes for its
 * own keyword-heuristic proposer.
 */
export const SEGMENT_SUGGESTION_CATEGORIES = ['churn_risk', 'payment_risk', 'trial', 'vip'] as const;
export type SegmentSuggestionCategory = (typeof SEGMENT_SUGGESTION_CATEGORIES)[number];

export function isSegmentSuggestionCategory(value: string): value is SegmentSuggestionCategory {
  return (SEGMENT_SUGGESTION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The minimal shape {@link proposeSegmentSuggestions} needs from a registered schema field — a
 * deliberately narrow subset of `SchemaFieldDef` (which lives in `@growthos/firebase-orm-models`, a
 * package `@growthos/shared` must never depend on) so this module stays Firestore-free and unit
 * testable on plain objects, the same "pure, dependency-free proposer" posture `suggestFieldMappingRules`
 * and `proposeFunnelSteps` already establish for their own inputs.
 */
export interface SegmentSuggestionSourceField {
  name: string;
  type: string;
}

/**
 * One proposed high-value list: a single boolean field on `schemaName`, read as a signal for
 * `category`, expressed as the one-condition filter a saved `SegmentModel` already knows how to store
 * and count. `confidence` is 0..1, purely to rank/display — not a probability from a real model, since
 * today's proposer is a deterministic keyword heuristic (see `suggest.ts`'s own doc comment), the same
 * posture `MappingSuggestion.confidence`/`FunnelStepSuggestion.confidence` already established for
 * their own heuristic proposers.
 */
export interface SegmentSuggestion {
  schemaName: string;
  field: string;
  category: SegmentSuggestionCategory;
  filters: SegmentFilterCondition[];
  confidence: number;
}
