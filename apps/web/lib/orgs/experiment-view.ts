import type { ExperimentResult, ExperimentVariantResult } from '@growthos/shared';

export interface ExperimentsSummary {
  experiments: number;
  variants: number;
  exposures: number;
  conversions: number;
  /** Non-control variants significantly better than their control. */
  significantWins: number;
  /** Non-control variants significantly worse than their control. */
  significantLosses: number;
}

/** Totals across every experiment's variants, for the page's KPI row and pipeline diagram. */
export function summariseExperiments(results: readonly ExperimentResult[]): ExperimentsSummary {
  const variants = results.flatMap((result) => result.variants);
  const tested = variants.filter((variant) => !variant.isControl && variant.isSignificant && variant.upliftVsControlPct !== null);
  return {
    experiments: results.length,
    variants: variants.length,
    exposures: variants.reduce((sum, variant) => sum + variant.exposures, 0),
    conversions: variants.reduce((sum, variant) => sum + variant.conversions, 0),
    significantWins: tested.filter((variant) => (variant.upliftVsControlPct ?? 0) > 0).length,
    significantLosses: tested.filter((variant) => (variant.upliftVsControlPct ?? 0) < 0).length,
  };
}

export type ExperimentVariantBadge = 'control' | 'significant' | 'not_significant' | 'insufficient_data';

/** Which badge a variant row renders — the control itself never carries a p-value (nothing to test it against), an insufficient sample renders distinctly from a plain "not significant yet" result so a human doesn't read "no difference" into "not enough data". */
export function experimentVariantBadge(variant: ExperimentVariantResult): ExperimentVariantBadge {
  if (variant.isControl) return 'control';
  if (variant.pValue === null) return 'insufficient_data';
  return variant.isSignificant ? 'significant' : 'not_significant';
}

export function experimentVariantBadgeLabelKey(badge: ExperimentVariantBadge): string {
  switch (badge) {
    case 'control':
      return 'badgeControl';
    case 'significant':
      return 'badgeSignificant';
    case 'not_significant':
      return 'badgeNotSignificant';
    case 'insufficient_data':
      return 'badgeInsufficientData';
    default: {
      const exhaustive: never = badge;
      throw new Error(`Unknown experiment variant badge "${exhaustive as string}".`);
    }
  }
}
