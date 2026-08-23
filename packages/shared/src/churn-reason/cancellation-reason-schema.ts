/** The event kind + schema name every cancellation-reason payload registers/validates under (KAN-84, plan `14 §Gap 10`). */
export const CANCELLATION_REASON_SCHEMA_KIND = 'event' as const;
export const CANCELLATION_REASON_SCHEMA_NAME = 'cancellation_reason';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `SurveyResponseSchemaFieldSpec`
 * (KAN-82) established. The consumer maps it to the real type at the
 * registration call site.
 */
export interface CancellationReasonSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The cancellation-reason event's registerable field list. `reason_code`
 * is the structured half of the AC (one of {@link CANCELLATION_REASON_CODES}
 * — not enforced by the schema registry itself, which only knows field
 * types, not a specific value taxonomy); `comment` is the free-text half a
 * cancel flow or exit survey lets the customer add. Same posture
 * `SURVEY_RESPONSE_SCHEMA_FIELDS`'s own `comment` field takes: not flagged
 * PII (arbitrary free text, not one of this codebase's identity-shaped
 * fields), since the whole point of the theme-clustering digest is
 * surfacing these comments' actual text, which flagging `is_pii` would
 * silently redact (record-feed's own convention) without this schema's
 * registrant ever having asked for that.
 */
export const CANCELLATION_REASON_SCHEMA_FIELDS: readonly CancellationReasonSchemaFieldSpec[] = [
  { name: 'reason_code', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'comment', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];
