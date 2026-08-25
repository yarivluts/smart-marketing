/** One variant's raw exposure/conversion counts for one experiment — the shape `getExperimentResultsForProject` (`@growthos/firebase-orm-models`) derives from the `experiment_exposures`/`experiment_conversions` metric breakdown before handing it to {@link computeExperimentResult}. */
export interface ExperimentVariantCounts {
  variantKey: string;
  exposures: number;
  conversions: number;
}

/** One variant's computed result — its own conversion rate, plus (for a non-control variant with a computable test) its uplift and two-tailed significance against the experiment's control variant. */
export interface ExperimentVariantResult extends ExperimentVariantCounts {
  /** `conversions / exposures`, or `null` when `exposures` is 0 (nothing to divide). */
  conversionRate: number | null;
  isControl: boolean;
  /** Relative change vs. the control's conversion rate, as a percentage (e.g. `12.5` for a 12.5% relative lift). `null` for the control itself, or when either side's rate isn't computable. */
  upliftVsControlPct: number | null;
  /** Two-tailed p-value from a two-proportion z-test against the control. `null` for the control itself, or when the test isn't computable (an empty variant or a pooled proportion of exactly 0 or 1, i.e. no variance to test against). */
  pValue: number | null;
  /** `pValue !== null && pValue < SIGNIFICANCE_ALPHA` — conventional 95% confidence. `false` (not `null`) whenever `pValue` is `null`, so a caller can render this as a plain boolean badge without a third "unknown" state. */
  isSignificant: boolean;
}

export interface ExperimentResult {
  experimentKey: string;
  controlVariantKey: string;
  /** Control first, then every other variant sorted alphabetically by `variantKey`. */
  variants: ExperimentVariantResult[];
}

/** The conventional two-tailed significance threshold ("95% confidence") this module tests against — not configurable per experiment, the same fixed-threshold posture `MetricTargetsUnbuiltWarehouseTableError`'s sibling error classes take for their own fixed rules. */
export const SIGNIFICANCE_ALPHA = 0.05;

/**
 * Abramowitz & Stegun formula 7.1.26 — a rational approximation of the
 * error function accurate to within 1.5e-7, used below to compute the
 * standard normal CDF without a stats dependency. Same "deterministic,
 * dependency-free approximation" posture this codebase's other
 * buildable-today stand-ins take (e.g. `computeSignupQualityScore`'s
 * weighted heuristic) for what a real implementation would otherwise reach
 * for a library.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return sign * y;
}

function standardNormalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * A two-tailed two-proportion z-test's p-value, or `null` when it isn't
 * computable: either side has zero exposures (nothing to form a proportion
 * from), or the pooled proportion is exactly 0 or 1 (every exposure on
 * both sides landed the same way — no variance for the test's standard
 * error to divide by).
 */
function twoProportionZTestPValue(control: ExperimentVariantCounts, variant: ExperimentVariantCounts): number | null {
  if (control.exposures === 0 || variant.exposures === 0) return null;

  const pooled = (control.conversions + variant.conversions) / (control.exposures + variant.exposures);
  if (pooled === 0 || pooled === 1) return null;

  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / control.exposures + 1 / variant.exposures));
  if (standardError === 0) return null;

  const p1 = control.conversions / control.exposures;
  const p2 = variant.conversions / variant.exposures;
  const z = (p2 - p1) / standardError;
  return 2 * (1 - standardNormalCdf(Math.abs(z)));
}

function conversionRate(counts: ExperimentVariantCounts): number | null {
  return counts.exposures === 0 ? null : counts.conversions / counts.exposures;
}

/**
 * Picks the experiment's control variant: the one literally keyed
 * `"control"` if present (the conventional name a client library sends),
 * otherwise the alphabetically-first `variantKey` — a deterministic
 * fallback so every experiment has *some* baseline to compare against, even
 * one that never used the `"control"` convention.
 */
function pickControlVariantKey(variantCounts: readonly ExperimentVariantCounts[]): string {
  const explicit = variantCounts.find((v) => v.variantKey === 'control');
  if (explicit) return explicit.variantKey;
  return [...variantCounts].sort((a, b) => a.variantKey.localeCompare(b.variantKey))[0]!.variantKey;
}

/**
 * Pure aggregation over one experiment's raw per-variant exposure/
 * conversion counts — no I/O, mirrors `computeNpsBreakdown`'s (KAN-82) own
 * "pure function over already-fetched counts" shape. Throws only if handed
 * an empty `variantCounts` array (nothing to compute a control from) —
 * callers own filtering out experiments with no data before calling this,
 * the same precondition `computeCancellationReasonCodeBreakdown` places on
 * its own non-empty input.
 */
export function computeExperimentResult(experimentKey: string, variantCounts: readonly ExperimentVariantCounts[]): ExperimentResult {
  if (variantCounts.length === 0) {
    throw new Error('computeExperimentResult requires at least one variant.');
  }

  const controlVariantKey = pickControlVariantKey(variantCounts);
  const control = variantCounts.find((v) => v.variantKey === controlVariantKey)!;

  const variants: ExperimentVariantResult[] = [...variantCounts]
    .sort((a, b) => (a.variantKey === controlVariantKey ? -1 : b.variantKey === controlVariantKey ? 1 : a.variantKey.localeCompare(b.variantKey)))
    .map((counts) => {
      const isControl = counts.variantKey === controlVariantKey;
      const rate = conversionRate(counts);
      const controlRate = conversionRate(control);

      const upliftVsControlPct = isControl || rate === null || controlRate === null || controlRate === 0 ? null : ((rate - controlRate) / controlRate) * 100;
      const pValue = isControl ? null : twoProportionZTestPValue(control, counts);

      return {
        ...counts,
        conversionRate: rate,
        isControl,
        upliftVsControlPct,
        pValue,
        isSignificant: pValue !== null && pValue < SIGNIFICANCE_ALPHA,
      };
    });

  return { experimentKey, controlVariantKey, variants };
}
