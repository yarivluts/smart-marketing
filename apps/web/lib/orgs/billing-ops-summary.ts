import type { BillingOpsFeedEntryType, BillingOpsFeedEntryView } from './billing-ops-view';

export const BILLING_OPS_TYPES: readonly BillingOpsFeedEntryType[] = ['charge', 'failed_payment', 'refund'];

export interface BillingOpsCurrencyTotals {
  /** Upper-cased ISO currency. */
  currency: string;
  /** Sums in the currency's smallest unit, exactly as the provider reported them - never converted. */
  charge: number;
  failed_payment: number;
  refund: number;
}

export interface BillingOpsDayCounts {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  charge: number;
  failed_payment: number;
  refund: number;
}

export interface BillingOpsSummary {
  counts: Record<BillingOpsFeedEntryType, number>;
  /** One row per currency, largest charged amount first. Entries without an amount or currency are left out. */
  totalsByCurrency: BillingOpsCurrencyTotals[];
  /** Events per UTC day that has any, oldest first. */
  byDay: BillingOpsDayCounts[];
}

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Counts and totals over exactly the feed entries shown. Amounts are summed per currency, in the
 * smallest unit, because the divisor differs by currency - adding USD cents to JPY yen would be a
 * number that means nothing.
 */
export function summariseBillingFeed(entries: readonly BillingOpsFeedEntryView[]): BillingOpsSummary {
  const counts: Record<BillingOpsFeedEntryType, number> = { charge: 0, failed_payment: 0, refund: 0 };
  const byCurrency = new Map<string, BillingOpsCurrencyTotals>();
  const byDay = new Map<string, BillingOpsDayCounts>();
  for (const entry of entries) {
    counts[entry.type] += 1;
    const day = utcDay(entry.landedAt);
    const dayRow = byDay.get(day) ?? { day, charge: 0, failed_payment: 0, refund: 0 };
    dayRow[entry.type] += 1;
    byDay.set(day, dayRow);
    if (entry.amount !== null && entry.currency !== null) {
      const currency = entry.currency.toUpperCase();
      const totals = byCurrency.get(currency) ?? { currency, charge: 0, failed_payment: 0, refund: 0 };
      totals[entry.type] += entry.amount;
      byCurrency.set(currency, totals);
    }
  }
  return {
    counts,
    totalsByCurrency: [...byCurrency.values()].sort((a, b) => b.charge - a.charge || a.currency.localeCompare(b.currency)),
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/**
 * The four headline KPIs of the billing-ops page, or `null` for a KPI the data cannot support.
 *
 * A count of 0 is only a measurement when billing data is actually flowing. With no billing
 * events at all (Stripe not connected, or connected but nothing received yet) "0 charges" and
 * "0 failed payments" read as a clean bill of health when they are really "unknown" - so those
 * KPIs are `null` and the page renders its no-value state instead. The at-risk count is backed
 * by subscription snapshots rather than billing events, so it stays a real number whenever any
 * churning or dunning subscription has landed, and is `null` only when nothing billing-related
 * landed at all.
 */
export interface BillingOpsKpis {
  hasBillingEvents: boolean;
  charge: number | null;
  failed_payment: number | null;
  refund: number | null;
  atRisk: number | null;
}

export function billingOpsKpis(
  summary: Pick<BillingOpsSummary, 'counts'>,
  sizes: { eventCount: number; churnCount: number; dunningCount: number },
): BillingOpsKpis {
  const hasBillingEvents = sizes.eventCount > 0;
  const hasAnyBillingData = hasBillingEvents || sizes.churnCount > 0 || sizes.dunningCount > 0;
  return {
    hasBillingEvents,
    charge: hasBillingEvents ? summary.counts.charge : null,
    failed_payment: hasBillingEvents ? summary.counts.failed_payment : null,
    refund: hasBillingEvents ? summary.counts.refund : null,
    atRisk: hasAnyBillingData ? sizes.churnCount + sizes.dunningCount : null,
  };
}

/** Feed entries grouped by the UTC day they landed, newest day first, keeping each day's own order. */
export function groupFeedByDay<T extends { landedAt: string }>(entries: readonly T[]): { day: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const day = utcDay(entry.landedAt);
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, dayEntries]) => ({ day, entries: dayEntries }));
}

/** Sum of MRR per currency (smallest unit) over subscription entries that carry one, largest first. */
export function sumMrrByCurrency(entries: readonly { mrrNormalized: number | null; currency: string | null }[]): { currency: string; mrr: number }[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.mrrNormalized === null || entry.currency === null) continue;
    const currency = entry.currency.toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + entry.mrrNormalized);
  }
  return [...totals.entries()].map(([currency, mrr]) => ({ currency, mrr })).sort((a, b) => b.mrr - a.mrr);
}
