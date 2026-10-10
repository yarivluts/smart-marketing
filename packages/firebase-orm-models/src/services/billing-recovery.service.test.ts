import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_RECOVERY_WINDOW_DAYS, pairFailedPaymentRecoveries } from './billing-recovery.service';
import { mapChargeToEventRecords } from '../plugin-runtime/stripe/mappers';
import type { StripeCharge } from '../plugin-runtime/stripe/types';
import type { RawRecordModel } from '../models/raw-record.model';

type RecordLike = Pick<RawRecordModel, 'id' | 'kind' | 'payload' | 'landed_at'>;

const DAY_S = 24 * 60 * 60;
const T0 = Date.parse('2026-09-01T00:00:00.000Z') / 1000;
const NOW = '2026-10-10T00:00:00.000Z';

function charge(overrides: Partial<StripeCharge> & { id: string; created: number }): StripeCharge {
  return {
    object: 'charge',
    amount: 4999,
    currency: 'usd',
    customer: 'cus_1',
    status: 'succeeded',
    refunded: false,
    amount_refunded: 0,
    failure_code: null,
    failure_message: null,
    ...overrides,
  };
}

/** Lands a Stripe charge exactly the way the real mapper does, so the tests read the real envelope shape. */
function landed(stripeCharge: StripeCharge): { failed: RecordLike[]; charges: RecordLike[] } {
  const records = mapChargeToEventRecords(stripeCharge);
  const toRecord = (payload: Record<string, unknown>): RecordLike => ({
    id: `raw_${String(payload.event_id)}`,
    kind: 'event',
    payload,
    landed_at: '2026-10-09T00:00:00.000Z',
  });
  return {
    charges: records.filter((r) => r.event === 'stripe_charge').map(toRecord),
    failed: records.filter((r) => r.event === 'stripe_failed_payment').map(toRecord),
  };
}

function land(...charges: StripeCharge[]): { failed: RecordLike[]; charges: RecordLike[] } {
  return charges.map(landed).reduce((acc, next) => ({ failed: [...acc.failed, ...next.failed], charges: [...acc.charges, ...next.charges] }), {
    failed: [] as RecordLike[],
    charges: [] as RecordLike[],
  });
}

describe('pairFailedPaymentRecoveries', () => {
  it('returns an honest empty summary when nothing has landed', () => {
    const summary = pairFailedPaymentRecoveries([], [], { now: NOW });
    expect(summary.recoveries).toEqual([]);
    expect(summary.recoveredByCurrency).toEqual([]);
    expect(summary.recoveryRate).toBeNull();
    expect(summary.medianHoursToRecover).toBeNull();
    expect(summary.failedAttempts).toEqual({ recovered: 0, unrecovered: 0, pending: 0, unpairable: 0 });
    expect(summary.windowDays).toBe(DEFAULT_PAYMENT_RECOVERY_WINDOW_DAYS);
  });

  it('pairs a failure with a same-customer, same-amount successful charge inside the window', () => {
    const { failed, charges } = land(
      charge({ id: 'ch_fail', created: T0, status: 'failed', failure_code: 'card_declined' }),
      charge({ id: 'ch_ok', created: T0 + 3 * DAY_S }),
    );
    const summary = pairFailedPaymentRecoveries(failed, charges, { now: NOW });

    expect(summary.recoveries).toHaveLength(1);
    expect(summary.recoveries[0]).toMatchObject({
      customerId: 'cus_1',
      currency: 'USD',
      amountMinorUnits: 4999,
      recoveryChargeId: 'ch_ok',
      failedAttempts: 1,
      hoursToRecover: 72,
      lastFailureCode: 'card_declined',
    });
    expect(summary.failedAttempts).toEqual({ recovered: 1, unrecovered: 0, pending: 0, unpairable: 0 });
    expect(summary.recoveryRate).toBe(1);
    expect(summary.medianHoursToRecover).toBe(72);
  });

  it('does not count an ordinary later renewal outside the window as a recovery', () => {
    const { failed, charges } = land(
      charge({ id: 'ch_fail', created: T0, status: 'failed' }),
      // Next month's renewal: same customer, same amount, but 30 days later.
      charge({ id: 'ch_renewal', created: T0 + 30 * DAY_S }),
    );
    const summary = pairFailedPaymentRecoveries(failed, charges, { now: NOW });

    expect(summary.recoveries).toEqual([]);
    expect(summary.failedAttempts.unrecovered).toBe(1);
    expect(summary.recoveryRate).toBe(0);
  });

  it('honours a custom window', () => {
    const { failed, charges } = land(charge({ id: 'ch_fail', created: T0, status: 'failed' }), charge({ id: 'ch_ok', created: T0 + 5 * DAY_S }));
    expect(pairFailedPaymentRecoveries(failed, charges, { now: NOW, windowDays: 3 }).recoveries).toEqual([]);
    expect(pairFailedPaymentRecoveries(failed, charges, { now: NOW, windowDays: 7 }).recoveries).toHaveLength(1);
  });

  it('ignores charges before the failure, for another customer, a different amount, a refunded charge or a different currency', () => {
    const { failed, charges } = land(
      charge({ id: 'ch_before', created: T0 - DAY_S }),
      charge({ id: 'ch_fail', created: T0, status: 'failed' }),
      charge({ id: 'ch_other_customer', created: T0 + DAY_S, customer: 'cus_2' }),
      charge({ id: 'ch_other_amount', created: T0 + DAY_S, amount: 999 }),
      charge({ id: 'ch_refunded', created: T0 + DAY_S, refunded: true, amount_refunded: 4999 }),
      charge({ id: 'ch_other_currency', created: T0 + DAY_S, currency: 'eur' }),
    );
    const summary = pairFailedPaymentRecoveries(failed, charges, { now: NOW });
    expect(summary.recoveries).toEqual([]);
    expect(summary.failedAttempts.unrecovered).toBe(1);
  });

  it('collapses several retries settled by one charge into one recovered payment, counted once', () => {
    const { failed, charges } = land(
      charge({ id: 'ch_fail_1', created: T0, status: 'failed', failure_code: 'card_declined' }),
      charge({ id: 'ch_fail_2', created: T0 + 3 * DAY_S, status: 'failed', failure_code: 'insufficient_funds' }),
      charge({ id: 'ch_ok', created: T0 + 5 * DAY_S }),
    );
    const summary = pairFailedPaymentRecoveries(failed, charges, { now: NOW });

    expect(summary.recoveries).toHaveLength(1);
    expect(summary.recoveries[0]).toMatchObject({ failedAttempts: 2, hoursToRecover: 120, lastFailureCode: 'insufficient_funds' });
    expect(summary.recoveredByCurrency).toEqual([{ currency: 'USD', amountMinorUnits: 4999, payments: 1 }]);
    expect(summary.failedAttempts.recovered).toBe(2);
  });

  it('keeps totals per currency and never adds currencies together', () => {
    const { failed, charges } = land(
      charge({ id: 'ch_usd_fail', created: T0, status: 'failed', amount: 5000, currency: 'usd' }),
      charge({ id: 'ch_usd_ok', created: T0 + DAY_S, amount: 5000, currency: 'usd' }),
      charge({ id: 'ch_usd_fail_2', created: T0, status: 'failed', amount: 2500, currency: 'usd', customer: 'cus_3' }),
      charge({ id: 'ch_usd_ok_2', created: T0 + DAY_S, amount: 2500, currency: 'usd', customer: 'cus_3' }),
      charge({ id: 'ch_jpy_fail', created: T0, status: 'failed', amount: 3000, currency: 'jpy', customer: 'cus_2' }),
      charge({ id: 'ch_jpy_ok', created: T0 + 2 * DAY_S, amount: 3000, currency: 'jpy', customer: 'cus_2' }),
    );
    const summary = pairFailedPaymentRecoveries(failed, charges, { now: NOW });

    expect(summary.recoveredByCurrency).toEqual([
      { currency: 'USD', amountMinorUnits: 7500, payments: 2 },
      { currency: 'JPY', amountMinorUnits: 3000, payments: 1 },
    ]);
    expect(summary.recoveries.map((r) => r.currency).sort()).toEqual(['JPY', 'USD', 'USD']);
  });

  it('reports a failure whose window is still open as pending, not unrecovered, and leaves it out of the rate', () => {
    const now = new Date((T0 + 2 * DAY_S) * 1000);
    const { failed, charges } = land(charge({ id: 'ch_fail', created: T0, status: 'failed' }));
    const summary = pairFailedPaymentRecoveries(failed, charges, { now });

    expect(summary.failedAttempts).toEqual({ recovered: 0, unrecovered: 0, pending: 1, unpairable: 0 });
    expect(summary.recoveryRate).toBeNull();
  });

  it('counts a failure without a customer as unpairable rather than guessing', () => {
    const { failed, charges } = land(charge({ id: 'ch_fail', created: T0, status: 'failed', customer: null }), charge({ id: 'ch_ok', created: T0 + DAY_S, customer: null }));
    const summary = pairFailedPaymentRecoveries(failed, charges, { now: NOW });

    expect(summary.failedAttempts).toEqual({ recovered: 0, unrecovered: 0, pending: 0, unpairable: 1 });
    expect(summary.recoveries).toEqual([]);
  });

  it('pairs by when the payment happened (Stripe created), not when it landed', () => {
    const { failed, charges } = land(charge({ id: 'ch_fail', created: T0, status: 'failed' }), charge({ id: 'ch_ok', created: T0 + DAY_S }));
    // A backfill landing the success before the failure must not change the pairing.
    const reLanded = charges.map((record) => ({ ...record, landed_at: '2026-01-01T00:00:00.000Z' }));
    expect(pairFailedPaymentRecoveries(failed, reLanded, { now: NOW }).recoveries).toHaveLength(1);
  });

  it('counts one Stripe charge once even when it landed twice (webhook + backfill)', () => {
    const first = land(charge({ id: 'ch_fail', created: T0, status: 'failed' }), charge({ id: 'ch_ok', created: T0 + DAY_S }));
    const again = first.failed.map((record) => ({ ...record, id: `${record.id}_again` }));
    const summary = pairFailedPaymentRecoveries([...first.failed, ...again], first.charges, { now: NOW });

    expect(summary.failedAttempts.recovered).toBe(1);
    expect(summary.recoveries[0].failedAttempts).toBe(1);
  });
});
