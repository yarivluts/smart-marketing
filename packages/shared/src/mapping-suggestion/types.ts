import type { MappingCastType } from '../mapping-engine';

/**
 * One target field a mapping needs a rule for — the caller (`field-mapping.service.ts`) builds
 * this list from `mappingTargetFields()` (`@growthos/shared`'s mapping-engine), which already knows
 * a kind's required envelope fields plus its target schema's registered fields.
 */
export interface MappingSuggestionTargetField {
  targetField: string;
  type: MappingCastType;
}

/**
 * One proposed rule for a target field, produced from a sample payload (KAN-55 AC: "LLM proposes
 * field mapping from sample payload"). Only ever `rename`/`cast` — a heuristic proposer (or a real
 * LLM) can spot "this payload field looks like that target field", but has no basis for guessing a
 * `template` or `static` value, so those transforms are left for the user to add by hand.
 * `confidence` is 0..1, rounded to two decimals, purely to rank/display suggestions — it isn't a
 * probability from a model, since today's proposer (`suggestFieldMappingRules`) is a deterministic
 * name/type-similarity heuristic, not a real LLM call (see that function's doc comment).
 */
export interface MappingSuggestion {
  targetField: string;
  transform: 'rename' | 'cast';
  sourcePath: string;
  castType?: MappingCastType;
  confidence: number;
}
