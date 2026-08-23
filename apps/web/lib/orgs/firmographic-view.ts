import type { WarehouseRow } from '@growthos/firebase-orm-models';
import { toNumber } from './board-view';

/** One dimension value's "# vs $" composition row — the shape the Firmographics page's composition tables render from (KAN-87, plan `14 §Gap 11`). */
export interface FirmographicCompositionRow {
  value: string;
  count: number;
  mrr: number;
}

/**
 * Flattens a `firmographic_profiles_total`/`firmographic_mrr_total`
 * dimension-breakdown query's raw `WarehouseRow[]` into the plain
 * `{value, count, mrr}` shape the page's composition tables render —
 * most-profiles-first, same "most common first" convention
 * `toCancellationReasonDimensionBreakdownRows` (KAN-84) establishes for its
 * own breakdown. Sums (not just reads) each row's count/mrr per distinct
 * dimension value: the compiler always buckets by its own `bucket_date`
 * regardless of the requested dimensions (`compiler.ts`'s `groupByColumns`),
 * so a dimension value's data spread across more than one bucket comes back
 * as more than one row — the same accumulate-by-label pattern
 * `toCancellationReasonDimensionBreakdownRows` uses for the identical
 * reason.
 */
export function toFirmographicCompositionRows(rows: readonly WarehouseRow[], dimension: string): FirmographicCompositionRow[] {
  const totalsByValue = new Map<string, { count: number; mrr: number }>();
  for (const row of rows) {
    const value = String(row[dimension] ?? '');
    const existing = totalsByValue.get(value) ?? { count: 0, mrr: 0 };
    totalsByValue.set(value, {
      count: existing.count + toNumber(row.firmographic_profiles_total ?? null),
      mrr: existing.mrr + toNumber(row.firmographic_mrr_total ?? null),
    });
  }
  return Array.from(totalsByValue.entries())
    .map(([value, totals]) => ({ value, count: totals.count, mrr: totals.mrr }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Translation key for one industry value from `INDUSTRY_CATEGORIES`
 * (`@growthos/shared`) — the AC's "AI industry classification" taxonomy.
 * Falls back to the raw value for a category this mapper doesn't
 * recognize, same "map a fixed data-driven category through i18n" posture
 * `cancellationReasonCodeLabelKey` (KAN-84) establishes.
 */
export function firmographicIndustryLabelKey(industry: string): string {
  switch (industry) {
    case 'saas_software':
      return 'industrySaasSoftware';
    case 'ecommerce_retail':
      return 'industryEcommerceRetail';
    case 'healthcare':
      return 'industryHealthcare';
    case 'finance_fintech':
      return 'industryFinanceFintech';
    case 'education':
      return 'industryEducation';
    case 'professional_services':
      return 'industryProfessionalServices';
    case 'manufacturing':
      return 'industryManufacturing';
    case 'media_entertainment':
      return 'industryMediaEntertainment';
    case 'nonprofit':
      return 'industryNonprofit';
    case 'other':
      return 'industryOther';
    default:
      return industry;
  }
}
