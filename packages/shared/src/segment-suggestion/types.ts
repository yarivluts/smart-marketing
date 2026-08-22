import type { SegmentFilterCondition } from '../segments';

/**
 * The field-type vocabulary a suggestion candidate field may declare —
 * mirrors `SchemaFieldType` (`@growthos/firebase-orm-models`) independently,
 * the same "mirror without depending on it" reasoning `mapping-engine`'s own
 * `MappingCastType` and `metrics-compiler`'s types already establish (this
 * package never depends on `firebase-orm-models`).
 */
export const SEGMENT_SUGGESTION_FIELD_TYPES = ['string', 'number', 'boolean', 'timestamp', 'object', 'array'] as const;

export type SegmentSuggestionFieldType = (typeof SEGMENT_SUGGESTION_FIELD_TYPES)[number];

/** One field the target entity schema declares — just enough (`name`/`type`) for the heuristic to match against, the same minimal-descriptor posture `MappingTargetFieldDescriptor` (mapping-engine) establishes for its own caller-built candidate list. */
export interface SegmentSuggestionFieldDescriptor {
  name: string;
  type: SegmentSuggestionFieldType;
}

/**
 * One proposed segment definition (KAN-81, E14.x, plan `14 §Gap 9`
 * "AI-suggested lists"): a suggested name plus a ready-to-review, ANDed set
 * of filter conditions — the exact shape `createSegment` already accepts, so
 * the confirm step is "review/edit, then submit the existing create form",
 * not a new persistence path. `confidence` is 0..1, rounded to two decimals,
 * purely to rank/display suggestions — it isn't a probability from a model,
 * since today's proposer (`suggestSegmentCandidates`) is a deterministic
 * field-name/type heuristic, not a real LLM call (see that function's doc
 * comment).
 */
export interface SegmentSuggestion {
  name: string;
  filters: SegmentFilterCondition[];
  confidence: number;
}
