/** The event kind + schema name every `churn_reason` payload registers/validates under (KAN-84). */
export const CHURN_REASON_SCHEMA_KIND = 'event' as const;
export const CHURN_REASON_SCHEMA_NAME = 'churn_reason';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `SurveyResponseSchemaFieldSpec`
 * (KAN-82) and `TouchpointSchemaFieldSpec` (KAN-57) established. The
 * consumer maps it to the real type at the registration call site.
 */
export interface ChurnReasonSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The `churn_reason` event's registerable field list. `category` is the
 * structured half of the gap doc's "churn_reason structured + free text" —
 * a value from {@link CHURN_REASON_CATEGORIES}, validated by the tracking
 * SDK's own `submitChurnReason` call, not by the schema registry itself
 * (which only knows `string`/`number` field types, same posture
 * `survey_type` takes). `reason_text` is the free-text half a customer or
 * support agent writes themselves during a cancel flow/exit survey — not
 * flagged PII, matching `comment`'s own precedent on the `survey_response`
 * schema (KAN-82): the whole point of the AI theme digest is showing this
 * text, which flagging `is_pii` would silently redact on the generic
 * record-feed page without this schema's registrant ever having asked for
 * that.
 */
export const CHURN_REASON_SCHEMA_FIELDS: readonly ChurnReasonSchemaFieldSpec[] = [
  { name: 'category', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'reason_text', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];
