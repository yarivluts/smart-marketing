import { describe, expect, it } from 'vitest';
import { aggregateBillingRecoveryAnalytics } from './billing-recovery.service';
import type { RawRecordModel } from '../models/raw-record.model';

function failedPaymentRecord(overrides: {
  id: string;
  customerId: string;
  amountMinor: number;
  landedAt: string;
  chargeId?: string;
  failureCode?: string;
  failureMessage?: string;
}): RawRecordModel {
  return {
    id: overrides.id,
    kind: 'event',
    schema_name: 'stripe_failed_payment',
    landed_at: overrides.landedAt,
    payload: {
      event_id: `evt_${overrides.id}`,
      event: 'stripe_failed_payment',
      ts: overrides.landedAt,
      properties: {
        charge_id: overrides.chargeId ?? `ch_${overrides.id}`,
        customer_id: overrides.customerId,
        amount: overrides.amountMinor,
        currency: 'usd',
        failure_code: overrides.failureCode ?? 'card_declined',
        failure_message: overrides.failureMessage ?? 'Card was declined',
      },
    },
  } as unknown as RawRecordModel;
}

function chargeRecord(overrides: {
  id: string;
  customerId: string;
  amountMinor: number;
  landedAt: string;
  chargeId?: string;
  status?: string;
  refunded?: boolean;
  amountRefunded?: number;
}): RawRecordModel {
  return {
    id: overrides.id,
    kind: 'event',
    schema_name: 'stripe_charge',
    landed_at: overrides.landedAt,
    payload: {
      event_id: `evt_${overrides.id}`,
      event: 'stripe_charge',
      ts: overrides.landedAt,
      properties: {
        charge_id: overrides.chargeId ?? `ch_${overrides.id}`,
        customer_id: overrides.customerId,
        amount: overrides.amountMinor,
        currency: 'usd',
        status: overrides.status ?? 'succeeded',
        refunded: overrides.refunded ?? false,
        amount_refunded: overrides.amountRefunded ?? 0,
      },
    },
  } as unknown as RawRecordModel;
}

function dunningRecord(overrides: {
  id: string;
  customerId: string;
  mrrNormalized: number;
  status: 'past_due' | 'unpaid';
  landedAt: string;
}): RawRecordModel {
  return {
    id: overrides.id,
    kind: 'entity',
    schema_name: 'stripe_subscription',
    landed_at: overrides.landedAt,
    payload: {
      entity_id: `sub_${overrides.id}`,
      entity: 'stripe_subscription',
      ts: overrides.landedAt,
      attributes: {
        customer_id: overrides.customerId,
        mrr_normalized: overrides.mrrNormalized,
        currency: 'usd',
        status: overrides.status,
        started_at: '2026-01-01T00:00:00Z',
        plan_interval: 'month',
      },
    },
  } as unknown as RawRecordModel;
}

describe('aggregateBillingRecoveryAnalytics (KAN-304 pure aggregator)', () => {
  it('returns honest empty state when input arrays are empty', () => {
    const result = aggregateBillingRecoveryAnalytics([], [], []);
    expect(result).toEqual({
      hasData: false,
      recoveredRevenueTotal: 0,
      rolling30dRecovered: 0,
      rolling90dRecovered: 0,
      atRiskMrrTotal: 0,
      activeDunningCount: 0,
      recoveryRatePct: 0,
      failedPaymentsCount: 0,
      recoveredPaymentsCount: 0,
      avgRecoveryHours: 0,
      recentRecoveries: [],
      activeDunning: [],
    });
  });

  it('matches failed payments with subsequent successful charges and computes 48h recovery payback rate', () => {
    const fixedNow = new Date('2026-10-01T12:00:00Z');

    const failures = [
      failedPaymentRecord({
        id: 'fail_1',
        customerId: 'cus_alpha',
        amountMinor: 19800, // $198.00
        landedAt: '2026-09-20T10:00:00Z',
        chargeId: 'ch_fail_1',
        failureCode: 'insufficient_funds',
        failureMessage: 'Insufficient funds on credit card',
      }),
      failedPaymentRecord({
        id: 'fail_2',
        customerId: 'cus_beta',
        amountMinor: 4900, // $49.00
        landedAt: '2026-09-25T08:00:00Z',
        chargeId: 'ch_fail_2',
      }),
    ];

    const charges = [
      // cus_alpha recovered 48 hours later:
      chargeRecord({
        id: 'charge_1',
        customerId: 'cus_alpha',
        amountMinor: 19800,
        landedAt: '2026-09-22T10:00:00Z',
        chargeId: 'ch_rec_1',
      }),
      // Unrelated customer charge
      chargeRecord({
        id: 'charge_2',
        customerId: 'cus_gamma',
        amountMinor: 9900,
        landedAt: '2026-09-28T14:00:00Z',
      }),
    ];

    const dunning = [
      dunningRecord({
        id: 'sub_1',
        customerId: 'cus_beta',
        mrrNormalized: 49,
        status: 'past_due',
        landedAt: '2026-09-29T10:00:00Z',
      }),
    ];

    const result = aggregateBillingRecoveryAnalytics(failures, charges, dunning, {
      now: fixedNow,
    });

    expect(result.hasData).toBe(true);
    expect(result.failedPaymentsCount).toBe(2);
    expect(result.recoveredPaymentsCount).toBe(1);
    expect(result.recoveryRatePct).toBe(50); // 1 / 2 = 50%
    expect(result.avgRecoveryHours).toBe(48); // Exactly 48.0 hours
    expect(result.recoveredRevenueTotal).toBe(198);
    expect(result.rolling30dRecovered).toBe(198);
    expect(result.rolling90dRecovered).toBe(198);
    expect(result.activeDunningCount).toBe(1);
    expect(result.atRiskMrrTotal).toBe(49);

    expect(result.recentRecoveries).toHaveLength(1);
    expect(result.recentRecoveries[0]).toEqual({
      id: 'rec_fail_1_charge_1',
      customerId: 'cus_alpha',
      recoveredAmount: 198,
      recoveredAmountMinorUnits: 19800,
      currency: 'usd',
      failedAt: '2026-09-20T10:00:00Z',
      recoveredAt: '2026-09-22T10:00:00Z',
      latencyHours: 48,
      failureChargeId: 'ch_fail_1',
      recoveryChargeId: 'ch_rec_1',
      failureCode: 'insufficient_funds',
      failureMessage: 'Insufficient funds on credit card',
    });

    expect(result.activeDunning).toHaveLength(1);
    expect(result.activeDunning[0].customerId).toBe('cus_beta');
    expect(result.activeDunning[0].mrrNormalized).toBe(49);
    expect(result.activeDunning[0].status).toBe('past_due');
  });

  it('correctly partitions rolling 30d, 90d, and total historical recovered revenue', () => {
    const fixedNow = new Date('2026-10-01T12:00:00Z');

    const failures = [
      failedPaymentRecord({ id: 'f1', customerId: 'c1', amountMinor: 10000, landedAt: '2026-09-21T00:00:00Z' }),
      failedPaymentRecord({ id: 'f2', customerId: 'c2', amountMinor: 20000, landedAt: '2026-08-12T00:00:00Z' }),
      failedPaymentRecord({ id: 'f3', customerId: 'c3', amountMinor: 30000, landedAt: '2026-06-01T00:00:00Z' }),
    ];

    const charges = [
      chargeRecord({ id: 'ch1', customerId: 'c1', amountMinor: 10000, landedAt: '2026-09-22T00:00:00Z' }),
      chargeRecord({ id: 'ch2', customerId: 'c2', amountMinor: 20000, landedAt: '2026-08-13T00:00:00Z' }),
      chargeRecord({ id: 'ch3', customerId: 'c3', amountMinor: 30000, landedAt: '2026-06-02T00:00:00Z' }),
    ];

    const result = aggregateBillingRecoveryAnalytics(failures, charges, [], { now: fixedNow });

    expect(result.recoveredRevenueTotal).toBe(600); // 100 + 200 + 300
    expect(result.rolling30dRecovered).toBe(100); // Only c1
    expect(result.rolling90dRecovered).toBe(300); // c1 + c2
    expect(result.recoveryRatePct).toBe(100);
  });

  it('ignores charges occurring before the failed payment timestamp', () => {
    const failures = [
      failedPaymentRecord({ id: 'f1', customerId: 'c1', amountMinor: 5000, landedAt: '2026-09-25T10:00:00Z' }),
    ];

    // Charge was 5 days BEFORE the failure - cannot count as recovery
    const charges = [
      chargeRecord({ id: 'ch_old', customerId: 'c1', amountMinor: 5000, landedAt: '2026-09-20T10:00:00Z' }),
    ];

    const result = aggregateBillingRecoveryAnalytics(failures, charges, []);
    expect(result.recoveredPaymentsCount).toBe(0);
    expect(result.recoveryRatePct).toBe(0);
    expect(result.recoveredRevenueTotal).toBe(0);
  });

  it('ignores refunded charges as valid recoveries', () => {
    const failures = [
      failedPaymentRecord({ id: 'f1', customerId: 'c1', amountMinor: 5000, landedAt: '2026-09-20T10:00:00Z' }),
    ];

    const charges = [
      chargeRecord({
        id: 'ch_refunded',
        customerId: 'c1',
        amountMinor: 5000,
        landedAt: '2026-09-21T10:00:00Z',
        refunded: true,
      }),
      chargeRecord({
        id: 'ch_partially_refunded',
        customerId: 'c1',
        amountMinor: 5000,
        landedAt: '2026-09-22T10:00:00Z',
        amountRefunded: 2000,
      }),
    ];

    const result = aggregateBillingRecoveryAnalytics(failures, charges, []);
    expect(result.recoveredPaymentsCount).toBe(0);
  });
});
