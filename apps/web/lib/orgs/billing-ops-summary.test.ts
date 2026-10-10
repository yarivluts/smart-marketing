import { describe, expect, it } from 'vitest';
import type { BillingOpsFeedEntryView } from './billing-ops-view';
import { billingOpsKpis, groupFeedByDay, summariseBillingFeed, sumMrrByCurrency } from './billing-ops-summary';

function entry(overrides: Partial<BillingOpsFeedEntryView> & Pick<BillingOpsFeedEntryView, 'id' | 'type' | 'landedAt'>): BillingOpsFeedEntryView {
  return {
    environmentId: 'env',
    clientId: overrides.id,
    amount: null,
    currency: null,
    customerId: null,
    status: null,
    failureCode: null,
    failureMessage: null,
    refundReason: null,
    ...overrides,
  };
}

describe('summariseBillingFeed', () => {
  const entries = [
    entry({ id: '1', type: 'charge', landedAt: '2026-08-02T10:00:00Z', amount: 4999, currency: 'usd' }),
    entry({ id: '2', type: 'charge', landedAt: '2026-08-01T10:00:00Z', amount: 1000, currency: 'USD' }),
    entry({ id: '3', type: 'refund', landedAt: '2026-08-02T11:00:00Z', amount: 1000, currency: 'usd' }),
    entry({ id: '4', type: 'failed_payment', landedAt: '2026-08-02T12:00:00Z', amount: 500, currency: 'jpy' }),
    entry({ id: '5', type: 'charge', landedAt: '2026-08-02T13:00:00Z' }),
  ];

  it('counts every entry by type, including ones without an amount', () => {
    expect(summariseBillingFeed(entries).counts).toEqual({ charge: 3, failed_payment: 1, refund: 1 });
  });

  it('totals amounts per currency without mixing currencies', () => {
    expect(summariseBillingFeed(entries).totalsByCurrency).toEqual([
      { currency: 'USD', charge: 5999, failed_payment: 0, refund: 1000 },
      { currency: 'JPY', charge: 0, failed_payment: 500, refund: 0 },
    ]);
  });

  it('counts events per UTC day, oldest first', () => {
    expect(summariseBillingFeed(entries).byDay).toEqual([
      { day: '2026-08-01', charge: 1, failed_payment: 0, refund: 0 },
      { day: '2026-08-02', charge: 2, failed_payment: 1, refund: 1 },
    ]);
  });

  it('is all zeros for an empty feed', () => {
    expect(summariseBillingFeed([])).toEqual({ counts: { charge: 0, failed_payment: 0, refund: 0 }, totalsByCurrency: [], byDay: [] });
  });
});

describe('billingOpsKpis', () => {
  it('has no value for any KPI when no billing data landed at all - 0 would read as a measurement', () => {
    expect(billingOpsKpis(summariseBillingFeed([]), { eventCount: 0, churnCount: 0, dunningCount: 0 })).toEqual({
      hasBillingEvents: false,
      charge: null,
      failed_payment: null,
      refund: null,
      atRisk: null,
    });
  });

  it('reports real counts, including real zeros, once billing events exist', () => {
    const feed = [
      entry({ id: '1', type: 'charge', landedAt: '2026-08-02T10:00:00Z' }),
      entry({ id: '2', type: 'charge', landedAt: '2026-08-02T11:00:00Z' }),
      entry({ id: '3', type: 'failed_payment', landedAt: '2026-08-02T12:00:00Z' }),
    ];
    expect(billingOpsKpis(summariseBillingFeed(feed), { eventCount: feed.length, churnCount: 0, dunningCount: 0 })).toEqual({
      hasBillingEvents: true,
      charge: 2,
      failed_payment: 1,
      refund: 0,
      atRisk: 0,
    });
  });

  it('keeps the at-risk count when subscriptions landed even without billing events', () => {
    const kpis = billingOpsKpis(summariseBillingFeed([]), { eventCount: 0, churnCount: 2, dunningCount: 1 });
    expect(kpis.charge).toBeNull();
    expect(kpis.failed_payment).toBeNull();
    expect(kpis.refund).toBeNull();
    expect(kpis.atRisk).toBe(3);
  });
});

describe('groupFeedByDay', () => {
  it('groups by landed day, newest day first, keeping order within a day', () => {
    const groups = groupFeedByDay([
      { id: 'a', landedAt: '2026-08-02T13:00:00Z' },
      { id: 'b', landedAt: '2026-08-01T09:00:00Z' },
      { id: 'c', landedAt: '2026-08-02T08:00:00Z' },
    ]);
    expect(groups.map((group) => [group.day, group.entries.map((item) => item.id)])).toEqual([
      ['2026-08-02', ['a', 'c']],
      ['2026-08-01', ['b']],
    ]);
  });
});

describe('sumMrrByCurrency', () => {
  it('sums per currency and skips entries without MRR', () => {
    expect(
      sumMrrByCurrency([
        { mrrNormalized: 100, currency: 'usd' },
        { mrrNormalized: 50, currency: 'USD' },
        { mrrNormalized: null, currency: 'usd' },
        { mrrNormalized: 300, currency: 'eur' },
      ]),
    ).toEqual([
      { currency: 'EUR', mrr: 300 },
      { currency: 'USD', mrr: 150 },
    ]);
  });
});
