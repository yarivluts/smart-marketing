import { describe, expect, it } from 'vitest';
import { computeSubscriptionMrrNormalized, normalizeToMonthlyRecurringRevenue } from './mrr';
import type { StripeSubscription } from './types';

describe('normalizeToMonthlyRecurringRevenue', () => {
  it('leaves a monthly plan unchanged (plan `09 §2`\'s baseline case)', () => {
    expect(normalizeToMonthlyRecurringRevenue(2000, 1, 'month', 1)).toBe(2000);
  });

  it('divides a yearly plan by 12 (plan `09 §2`\'s literal rule: "amount/12 -> mrr_normalized")', () => {
    expect(normalizeToMonthlyRecurringRevenue(24000, 1, 'year', 1)).toBe(2000);
  });

  it('multiplies by quantity (seats)', () => {
    expect(normalizeToMonthlyRecurringRevenue(1000, 5, 'month', 1)).toBe(5000);
    expect(normalizeToMonthlyRecurringRevenue(12000, 3, 'year', 1)).toBe(3000);
  });

  it('honors a non-1 interval_count (e.g. a quarterly plan billed every 3 months)', () => {
    expect(normalizeToMonthlyRecurringRevenue(3000, 1, 'month', 3)).toBe(1000);
  });

  it('normalizes a weekly plan to an average monthly rate', () => {
    expect(normalizeToMonthlyRecurringRevenue(100, 1, 'week', 1)).toBeCloseTo(433.33, 1);
  });

  it('normalizes a daily plan to an average monthly rate', () => {
    expect(normalizeToMonthlyRecurringRevenue(10, 1, 'day', 1)).toBeCloseTo(304.17, 1);
  });
});

function subscriptionWithItems(
  items: { unitAmount: number; quantity: number; interval: StripeSubscription['items']['data'][number]['price']['recurring']['interval']; intervalCount: number }[],
): StripeSubscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    currency: 'usd',
    current_period_end: 1_700_000_000,
    cancel_at_period_end: false,
    canceled_at: null,
    created: 1_690_000_000,
    items: {
      data: items.map((item) => ({
        price: { unit_amount: item.unitAmount, currency: 'usd', recurring: { interval: item.interval, interval_count: item.intervalCount } },
        quantity: item.quantity,
      })),
    },
  };
}

describe('computeSubscriptionMrrNormalized', () => {
  it('computes a single-item monthly subscription', () => {
    const subscription = subscriptionWithItems([{ unitAmount: 2000, quantity: 1, interval: 'month', intervalCount: 1 }]);
    expect(computeSubscriptionMrrNormalized(subscription)).toBe(2000);
  });

  it('computes a single-item yearly subscription', () => {
    const subscription = subscriptionWithItems([{ unitAmount: 24000, quantity: 1, interval: 'year', intervalCount: 1 }]);
    expect(computeSubscriptionMrrNormalized(subscription)).toBe(2000);
  });

  it('sums every item, not just the first — a multi-item subscription mixing monthly and yearly add-ons', () => {
    const subscription = subscriptionWithItems([
      { unitAmount: 5000, quantity: 1, interval: 'month', intervalCount: 1 },
      { unitAmount: 12000, quantity: 1, interval: 'year', intervalCount: 1 },
    ]);
    expect(computeSubscriptionMrrNormalized(subscription)).toBe(6000);
  });

  it('returns 0 for a subscription with no items', () => {
    expect(computeSubscriptionMrrNormalized(subscriptionWithItems([]))).toBe(0);
  });
});
