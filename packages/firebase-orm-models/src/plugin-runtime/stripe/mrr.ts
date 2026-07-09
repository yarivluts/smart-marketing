import type { StripeSubscription, StripeSubscriptionInterval } from './types';

/** Average calendar-month length in the given recurring unit, used to normalize a non-monthly interval to a monthly rate. */
const MONTHS_PER_CYCLE: Record<StripeSubscriptionInterval, number> = {
  day: 12 / 365,
  week: 12 / 52,
  month: 1,
  year: 12,
};

/**
 * Normalizes one recurring line's revenue to a monthly rate (plan `09 §2`:
 * "yearly plans are normalized to MRR — `amount/12` -> `mrr_normalized` —
 * so monthly+yearly report on one MRR line"). For the plan's own literal
 * case (`interval: 'year', intervalCount: 1`) this is exactly
 * `unitAmount * quantity / 12`; day/week intervals generalize the same rule
 * using an average calendar-month length rather than special-casing only
 * month/year.
 */
export function normalizeToMonthlyRecurringRevenue(
  unitAmount: number,
  quantity: number,
  interval: StripeSubscriptionInterval,
  intervalCount: number,
): number {
  const totalPerCycle = unitAmount * quantity;
  const cycleLengthInMonths = MONTHS_PER_CYCLE[interval] * intervalCount;
  return totalPerCycle / cycleLengthInMonths;
}

/** Sums every line item's own normalized monthly revenue — a multi-item subscription's `mrr_normalized` is the sum across its items, not just its first one. */
export function computeSubscriptionMrrNormalized(subscription: StripeSubscription): number {
  return subscription.items.data.reduce(
    (total, item) =>
      total +
      normalizeToMonthlyRecurringRevenue(
        item.price.unit_amount,
        item.quantity,
        item.price.recurring.interval,
        item.price.recurring.interval_count,
      ),
    0,
  );
}
