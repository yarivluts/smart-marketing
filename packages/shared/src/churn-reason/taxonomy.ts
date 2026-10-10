/**
 * The fixed structured cancellation-reason taxonomy (KAN-84, plan `14
 * §Gap 10`'s "live taxonomy") a cancel flow or exit survey picks one of,
 * alongside the free-text `comment`. Deliberately a small, closed set
 * (mirrors `CREDENTIAL_PROVIDERS`'/`API_KEY_SCOPES`' own "curated catalog,
 * not open string" posture) — `other` is the escape hatch for anything the
 * taxonomy doesn't yet name, and the free-text `clusterCancellationReasonComments`
 * digest exists precisely to surface what a growing pile of `other`
 * reasons is actually about.
 *
 * `payment_failed` is the one involuntary code (KAN-306): the customer did not choose to leave, the
 * billing provider canceled after payment retries ran out (Stripe's `cancellation_details.reason:
 * 'payment_failed'`). It is kept apart from the voluntary codes so involuntary churn - which dunning,
 * not product or pricing, fixes - never inflates a voluntary bucket like `technical_issues`.
 */
export const CANCELLATION_REASON_CODES = [
  'too_expensive',
  'missing_features',
  'switched_competitor',
  'poor_support',
  'not_using_enough',
  'technical_issues',
  'payment_failed',
  'other',
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

export function isCancellationReasonCode(value: string): value is CancellationReasonCode {
  return (CANCELLATION_REASON_CODES as readonly string[]).includes(value);
}
