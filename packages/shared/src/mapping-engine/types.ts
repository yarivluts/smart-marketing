/**
 * Types for the field-mapping engine (KAN-54, plan `12 §2.4`/`13 §E9.2`):
 * pure, Firestore-free — it turns one raw inbound-webhook payload (KAN-53's
 * `HookDeliveryModel.raw_payload`) into the same envelope shape
 * `ingest.service.ts`'s `IngestBatchInput` records expect, via a saved list
 * of JSONPath-to-schema-field rules. Kept independent of any specific ORM
 * model type so it can be unit-tested with plain fixtures, the same posture
 * `metrics-compiler`'s types establish relative to `MetricDefModel`.
 */

export const MAPPING_RECORD_KINDS = ['event', 'entity', 'measure'] as const;
export type MappingRecordKind = (typeof MAPPING_RECORD_KINDS)[number];

export function isMappingRecordKind(value: string): value is MappingRecordKind {
  return (MAPPING_RECORD_KINDS as readonly string[]).includes(value);
}

/**
 * `rename`: copies the JSONPath's extracted value verbatim.
 * `cast`: copies the JSONPath's extracted value, coerced to `castType`.
 * `template`: renders a string built from static text plus `{{json.path}}`
 * placeholders (each resolved the same way `rename`'s `sourcePath` is).
 * `static`: assigns a fixed literal regardless of the payload.
 */
export const MAPPING_RULE_TRANSFORMS = ['rename', 'cast', 'template', 'static'] as const;
export type MappingRuleTransform = (typeof MAPPING_RULE_TRANSFORMS)[number];

export function isMappingRuleTransform(value: string): value is MappingRuleTransform {
  return (MAPPING_RULE_TRANSFORMS as readonly string[]).includes(value);
}

/** The type vocabulary a `cast` rule may coerce into — mirrors `SchemaFieldType` (`@growthos/firebase-orm-models`) independently, the same "mirror without depending on it" reasoning `metrics-compiler`'s own types establish. */
export const MAPPING_CAST_TYPES = ['string', 'number', 'boolean', 'timestamp', 'object', 'array'] as const;
export type MappingCastType = (typeof MAPPING_CAST_TYPES)[number];

export function isMappingCastType(value: string): value is MappingCastType {
  return (MAPPING_CAST_TYPES as readonly string[]).includes(value);
}

/**
 * One rule mapping a target field to a value derived from the raw payload.
 * `targetField` is either one of the mapping's kind-specific envelope fields
 * (`event_id`/`event`/`ts` for `event`, `id` for `entity`,
 * `measure`/`ts`/`value` for `measure`) or `<container>.<name>` addressing a
 * field inside the envelope's schema-validated bag (`properties`/
 * `attributes`/`dimensions` respectively) — see {@link validateMappingRules}.
 */
export interface MappingRule {
  targetField: string;
  transform: MappingRuleTransform;
  /** Required for `rename`/`cast`. */
  sourcePath?: string;
  /** Required for `cast`. */
  castType?: MappingCastType;
  /** Required for `template`; may contain any number of `{{json.path}}` placeholders. */
  template?: string;
  /** Required for `static`. */
  staticValue?: string;
}

/** Caller-facing shape for one rule before it's validated into a {@link MappingRule} — mirrors `SchemaFieldInput`'s (`schema-registry.service.ts`) relationship to `SchemaFieldDef`. */
export interface MappingRuleInput {
  targetField: string;
  transform: string;
  sourcePath?: string;
  castType?: string;
  template?: string;
  staticValue?: string;
}

export interface MappingApplyResult {
  record: Record<string, unknown>;
  /** `"<targetField>:<reason>"` entries — a rule whose source is missing or whose cast fails is reported here rather than aborting the whole mapping. */
  errors: readonly string[];
}
