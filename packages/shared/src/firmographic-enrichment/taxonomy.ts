/**
 * The fixed firmographic industry taxonomy (KAN-87, plan `14 §Gap 11`'s "AI
 * industry classification"). Deliberately a small, closed set — mirrors
 * `CANCELLATION_REASON_CODES` (KAN-84)/`INDUSTRY`-style "curated catalog,
 * not open string" posture used throughout this codebase's own fixed
 * vocabularies. `other` is the escape hatch for a company
 * `classifyCompanyIndustry` can't confidently place.
 */
export const INDUSTRY_CATEGORIES = [
  'saas_software',
  'ecommerce_retail',
  'healthcare',
  'finance_fintech',
  'education',
  'professional_services',
  'manufacturing',
  'media_entertainment',
  'nonprofit',
  'other',
] as const;

export type IndustryCategory = (typeof INDUSTRY_CATEGORIES)[number];

export function isIndustryCategory(value: string): value is IndustryCategory {
  return (INDUSTRY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * A company's self-reported employee-count band, captured alongside
 * `industry` at enrichment time. A separate, deliberately smaller fixed set
 * than `COMPANY_SIZE_BAND` (KAN-83's onboarding survey) — that module's own
 * bands are a signup-intent signal about the *person* filling out a form;
 * this one describes the *company itself* for composition dashboards
 * (`14 §Gap 11`'s "# vs $" breakdown), so the two are intentionally decoupled
 * rather than shared, same posture every other self-reported-data module in
 * this codebase takes for its own small enums (no shared "size band" type
 * exists anywhere in `packages/shared`).
 */
export const EMPLOYEE_COUNT_RANGES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
export type EmployeeCountRange = (typeof EMPLOYEE_COUNT_RANGES)[number];

export function isEmployeeCountRange(value: string): value is EmployeeCountRange {
  return (EMPLOYEE_COUNT_RANGES as readonly string[]).includes(value);
}

/** A coarse geographic region, the third composition axis the AC names alongside industry/employee-count. */
export const FIRMOGRAPHIC_REGIONS = ['north_america', 'europe', 'asia_pacific', 'latin_america', 'middle_east_africa', 'other'] as const;
export type FirmographicRegion = (typeof FIRMOGRAPHIC_REGIONS)[number];

export function isFirmographicRegion(value: string): value is FirmographicRegion {
  return (FIRMOGRAPHIC_REGIONS as readonly string[]).includes(value);
}
