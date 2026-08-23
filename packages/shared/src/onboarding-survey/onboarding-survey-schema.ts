/** The event kind + schema name every onboarding-survey payload registers/validates under (KAN-83, plan `14 §Gap 4`). */
export const ONBOARDING_SURVEY_SCHEMA_KIND = 'event' as const;
export const ONBOARDING_SURVEY_SCHEMA_NAME = 'onboarding_survey';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `SurveyResponseSchemaFieldSpec`
 * (KAN-82)/`CancellationReasonSchemaFieldSpec` (KAN-84) established. The
 * consumer maps it to the real type at the registration call site.
 */
export interface OnboardingSurveySchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The onboarding-survey event's registerable field list: the three
 * structured answers (`OnboardingSurveyAnswers`), the optional free-text
 * `use_case`, and `quality_score` itself — the number `computeSignupQualityScore`
 * (this module) computes from the three structured answers *before* the
 * event is ever sent (see `tracker.submitOnboardingSurvey`'s own doc
 * comment for why the score travels as a landed field rather than being
 * recomputed later). Landing it as a real field lets
 * `fact_signup_quality_score` (the dbt core mart this schema feeds) flatten
 * it into a real column with zero SQL-side scoring logic — the same
 * "compute before send, flatten on land" posture `reason_code`/`comment`
 * (KAN-84) and `score` (KAN-82) already establish; only `quality_score`
 * itself is a derived value rather than a raw respondent answer.
 * None of these are PII — company size/budget/urgency/use-case are
 * firmographic, not personal, information.
 */
export const ONBOARDING_SURVEY_SCHEMA_FIELDS: readonly OnboardingSurveySchemaFieldSpec[] = [
  { name: 'company_size', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'budget_range', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'urgency', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'use_case', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'quality_score', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
];
