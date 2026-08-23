import type { FirmographicIndustryCount } from './types';

/**
 * Pure aggregation over a flat list of `industry` values — the Firestore-
 * side half of the AC's composition dashboard (the warehouse-backed half,
 * "# vs $" broken down by industry/employee-count/region, is
 * `getFirmographicCompositionDimensionBreakdownForProject` in
 * `@growthos/firebase-orm-models`). No I/O, callers own fetching/filtering
 * the raw records — same posture `computeCancellationReasonCodeBreakdown`
 * (KAN-84) establishes for its own pure aggregation. Most-common industry
 * first, ties broken alphabetically for a deterministic order.
 */
export function computeFirmographicIndustryBreakdown(industries: readonly string[]): FirmographicIndustryCount[] {
  const counts = new Map<string, number>();
  for (const industry of industries) {
    counts.set(industry, (counts.get(industry) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry));
}
