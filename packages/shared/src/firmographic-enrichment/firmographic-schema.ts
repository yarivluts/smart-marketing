/** The event kind + schema name every firmographic-enrichment payload registers/validates under (KAN-87, plan `14 §Gap 11`). */
export const FIRMOGRAPHIC_SCHEMA_KIND = 'event' as const;
export const FIRMOGRAPHIC_SCHEMA_NAME = 'company_firmographic';

/**
 * A schema field spec shaped like (but decoupled from)
 * `@growthos/firebase-orm-models`'s `SchemaFieldInput` — `packages/shared`
 * has no dependency on that package, same posture `OnboardingSurveySchemaFieldSpec`
 * (KAN-83)/`CancellationReasonSchemaFieldSpec` (KAN-84) established. The
 * consumer maps it to the real type at the registration call site.
 */
export interface FirmographicSchemaFieldSpec {
  name: string;
  type: 'string' | 'number';
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

/**
 * The firmographic-enrichment event's registerable field list: the
 * self-reported `company_name`/`company_domain`/`employee_count_range`/
 * `region`, plus `industry` — the value `classifyCompanyIndustry` computes
 * from `company_name`/`company_domain` *before* the event is ever sent (see
 * `tracker.submitFirmographicProfile`'s own doc comment). Landing it as a
 * real field lets `fact_company_firmographic` (the dbt core mart this
 * schema feeds) flatten it into a real column with zero SQL-side
 * classification logic — the same "compute before send, flatten on land"
 * posture `quality_score` (KAN-83) and `reason_code` (KAN-84) already
 * establish; only `industry` itself is a derived value rather than a raw
 * respondent answer. None of these are PII: a company's own name/domain/
 * size/region/industry describes the business account, not an individual
 * person — same reasoning `ONBOARDING_SURVEY_SCHEMA_FIELDS`'s own doc
 * comment gives for its own firmographic answers.
 */
export const FIRMOGRAPHIC_SCHEMA_FIELDS: readonly FirmographicSchemaFieldSpec[] = [
  { name: 'company_name', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'company_domain', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'employee_count_range', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'region', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'industry', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
];
