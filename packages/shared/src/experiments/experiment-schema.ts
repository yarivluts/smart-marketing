/**
 * The two event kinds an experiment/variant/exposure integration sends
 * (plan `14 §Gap 3`, KAN-89 slice 1). Both carry the same two fields —
 * `experiment_key` and `variant_key` — so the dbt mart built from them
 * (`fact_experiment_event`) never needs a join to know which variant a
 * conversion belongs to: the client library that bucketed the visitor into
 * a variant is the same one that later fires the goal event, and is
 * expected to stamp the variant it already knows on both calls, the same
 * "client already knows its own state" assumption `touchpoint-capture`
 * (KAN-57) makes for `anon_id`. This trades away the "the server infers
 * which variant a later, variant-blind conversion belongs to" case (that
 * would need a `bridge_identity`-style join, more machinery than a
 * lightweight experiment model needs) for a model simple enough to query
 * with one bare `GROUP BY`, matching this codebase's own established
 * "flatten JSON properties into real mart columns, no generic JSON
 * extraction in the compiler" posture.
 */
export const EXPERIMENT_EXPOSURE_SCHEMA_KIND = 'event' as const;
export const EXPERIMENT_EXPOSURE_SCHEMA_NAME = 'experiment_exposure';
export const EXPERIMENT_CONVERSION_SCHEMA_KIND = 'event' as const;
export const EXPERIMENT_CONVERSION_SCHEMA_NAME = 'experiment_conversion';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `SurveyResponseSchemaFieldSpec`
 * (KAN-82) / `CancellationReasonSchemaFieldSpec` (KAN-84) establish. The
 * consumer maps it to the real type at the registration call site.
 */
export interface ExperimentSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/** Both `experiment_exposure` and `experiment_conversion` register the identical field list — see this module's own doc comment for why. */
export const EXPERIMENT_SCHEMA_FIELDS: readonly ExperimentSchemaFieldSpec[] = [
  { name: 'experiment_key', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'variant_key', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
];
