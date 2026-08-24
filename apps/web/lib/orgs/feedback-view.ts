import type { WarehouseRow } from '@growthos/firebase-orm-models';
import { computeNpsScoreFromCounts, type FeedbackThemeCluster } from '@growthos/shared';
import { toNumber } from './board-view';

/**
 * Translation key for one feedback theme cluster's fixed name (KAN-82's
 * `clusterFeedbackThemes` keyword taxonomy is a small, known, finite set —
 * same "map a fixed data-driven category through i18n" posture
 * `billingOpsFeedEntryTypeLabelKey` established for its own three billing
 * event types). Falls back to the raw theme name for a value this mapper
 * doesn't recognize, so a future taxonomy addition degrades to an
 * untranslated (not missing) label rather than crashing the page.
 */
export function feedbackThemeLabelKey(theme: FeedbackThemeCluster['theme']): string {
  switch (theme) {
    case 'pricing':
      return 'themePricing';
    case 'support':
      return 'themeSupport';
    case 'bugs':
      return 'themeBugs';
    case 'performance':
      return 'themePerformance';
    case 'missing_features':
      return 'themeMissingFeatures';
    case 'onboarding':
      return 'themeOnboarding';
    case 'usability':
      return 'themeUsability';
    default:
      return theme;
  }
}

/** One dimension value's NPS breakdown — the row shape the Feedback page's plan/channel/cohort breakdown tables render from. */
export interface NpsDimensionBreakdownRow {
  value: string;
  respondents: number;
  npsScore: number | null;
}

/**
 * Flattens an `nps_respondents`/`nps_promoters`/`nps_detractors` dimension-
 * breakdown query's raw `WarehouseRow[]` into the plain `{value, respondents,
 * npsScore}` shape the page's breakdown tables render — most respondents
 * first, same "most common first" convention `toCancellationReasonDimensionBreakdownRows`
 * (KAN-84) establishes for its own breakdown rows. Sums (not just reads)
 * each row's counts per distinct dimension value: the compiler always
 * buckets by its own `bucket_date` regardless of the requested dimensions
 * (`compiler.ts`'s `groupByColumns`), so a dimension value with responses
 * spread across more than one bucket comes back as more than one row — the
 * same accumulate-by-label pattern that sibling mapper uses for the
 * identical reason. `npsScore` is derived per dimension value from the
 * summed counts via `computeNpsScoreFromCounts`, since the compiler can't
 * break `nps_score` itself down by dimension (see `getNpsDimensionBreakdownForProject`'s
 * own doc comment).
 */
export function toNpsDimensionBreakdownRows(rows: readonly WarehouseRow[], dimension: string): NpsDimensionBreakdownRow[] {
  const countsByValue = new Map<string, { respondents: number; promoters: number; detractors: number }>();
  for (const row of rows) {
    const value = String(row[dimension] ?? '');
    const counts = countsByValue.get(value) ?? { respondents: 0, promoters: 0, detractors: 0 };
    counts.respondents += toNumber(row.nps_respondents ?? null);
    counts.promoters += toNumber(row.nps_promoters ?? null);
    counts.detractors += toNumber(row.nps_detractors ?? null);
    countsByValue.set(value, counts);
  }
  return Array.from(countsByValue.entries())
    .map(([value, counts]) => ({
      value,
      respondents: counts.respondents,
      npsScore: computeNpsScoreFromCounts(counts.promoters, counts.detractors, counts.respondents),
    }))
    .sort((a, b) => b.respondents - a.respondents || a.value.localeCompare(b.value));
}
