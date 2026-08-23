/** The event kind + schema name every survey-response payload registers/validates under (KAN-82). */
export const SURVEY_RESPONSE_SCHEMA_KIND = 'event' as const;
export const SURVEY_RESPONSE_SCHEMA_NAME = 'survey_response';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared` has
 * no dependency on that package, same posture `TouchpointSchemaFieldSpec`
 * (KAN-57) established. The consumer maps it to the real type at the
 * registration call site.
 */
export interface SurveyResponseSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The survey-response event's registerable field list. `survey_type`
 * discriminates which survey this response belongs to (`nps` is the only
 * value this story's own metric pack/digest reads today; a future CSAT
 * survey would land under the same schema with a different value rather
 * than a parallel schema). `comment` is free text a respondent writes
 * themselves — not flagged PII, same posture `billing-ops-view.ts`'s own
 * Stripe `failureMessage`/`refundReason` fields take (arbitrary free text,
 * not one of this codebase's identity-shaped fields like email/name):
 * the whole point of the theme-clustering digest is surfacing these
 * comments' actual text, which flagging `is_pii` would silently redact
 * (record-feed's own convention) without this schema's registrant ever
 * having asked for that.
 */
export const SURVEY_RESPONSE_SCHEMA_FIELDS: readonly SurveyResponseSchemaFieldSpec[] = [
  { name: 'survey_type', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'score', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'comment', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];
