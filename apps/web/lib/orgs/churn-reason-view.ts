import type { WarehouseRow } from '@growthos/firebase-orm-models';
import type { CancellationReasonThemeCluster } from '@growthos/shared';
import { toNumber } from './board-view';

/** One dimension value's cancellation count — the row shape the Churn Reasons page's plan/channel/cohort breakdown tables render from. */
export interface CancellationReasonDimensionBreakdownRow {
  value: string;
  count: number;
}

/**
 * Flattens a `cancellations_total` dimension-breakdown query's raw
 * `WarehouseRow[]` into the plain `{value, count}` shape the page's
 * breakdown tables render — most cancellations first, same "most common
 * first" convention `computeCancellationReasonCodeBreakdown` establishes
 * for its own Firestore-side breakdown. Sums (not just reads) each row's
 * count per distinct dimension value: the compiler always buckets by its
 * own `bucket_date` regardless of the requested dimensions (`compiler.ts`'s
 * `groupByColumns`), so a dimension value with cancellations spread across
 * more than one bucket comes back as more than one row — the same
 * accumulate-by-label pattern a `histogram` board tile's own view-mapper
 * uses for the identical reason.
 */
export function toCancellationReasonDimensionBreakdownRows(rows: readonly WarehouseRow[], dimension: string): CancellationReasonDimensionBreakdownRow[] {
  const countByValue = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[dimension] ?? '');
    countByValue.set(value, (countByValue.get(value) ?? 0) + toNumber(row.cancellations_total ?? null));
  }
  return Array.from(countByValue.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Translation key for one churn-reason free-text theme cluster's fixed name
 * (KAN-84's `clusterCancellationReasonComments` keyword taxonomy is a
 * small, known, finite set — same "map a fixed data-driven category
 * through i18n" posture `feedbackThemeLabelKey` (KAN-82) established).
 * Falls back to the raw theme name for a value this mapper doesn't
 * recognize, so a future taxonomy addition degrades to an untranslated
 * (not missing) label rather than crashing the page.
 */
export function cancellationReasonThemeLabelKey(theme: CancellationReasonThemeCluster['theme']): string {
  switch (theme) {
    case 'pricing':
      return 'themePricing';
    case 'competitor':
      return 'themeCompetitor';
    case 'missing_features':
      return 'themeMissingFeatures';
    case 'support':
      return 'themeSupport';
    case 'bugs':
      return 'themeBugs';
    case 'not_using':
      return 'themeNotUsing';
    default:
      return theme;
  }
}

/**
 * Translation key for one structured `reason_code` value from
 * `CANCELLATION_REASON_CODES` (`@growthos/shared`) — the AC's "live
 * taxonomy" half. Falls back to the raw code for a value this mapper
 * doesn't recognize, same reasoning as {@link cancellationReasonThemeLabelKey}.
 */
export function cancellationReasonCodeLabelKey(reasonCode: string): string {
  switch (reasonCode) {
    case 'too_expensive':
      return 'reasonTooExpensive';
    case 'missing_features':
      return 'reasonMissingFeatures';
    case 'switched_competitor':
      return 'reasonSwitchedCompetitor';
    case 'poor_support':
      return 'reasonPoorSupport';
    case 'not_using_enough':
      return 'reasonNotUsingEnough';
    case 'technical_issues':
      return 'reasonTechnicalIssues';
    case 'other':
      return 'reasonOther';
    default:
      return reasonCode;
  }
}
