import type { ExperimentVariantResult } from '@growthos/shared';

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
