import { describe, expect, it } from 'vitest';
import { aggregateBillingRecoveryAnalytics, type RawRecordModel } from '@growthos/firebase-orm-models';

function mockRecord(schema: string, kind: 'event' | 'entity', payloadData: Record<string, unknown>, landedAt: string): RawRecordModel {
  return {
    id: `rec_${Math.random().toString(36).slice(2)}`,
    kind,
    schema_name: schema,
    landed_at: landedAt,
    payload: {
      event_id: `evt_${Math.random().toString(36).slice(2)}`,
      event: schema,
      ts: landedAt,
      [kind === 'entity' ? 'attributes' : 'properties']: payloadData,
    },
  } as unknown as RawRecordModel;
}

describe('billing recovery telemetry in apps/web (KAN-304)', () => {
  it('aggregates recovered payments and computes rolling 30d/90d metrics', () => {
    const now = new Date('2026-10-01T12:00:00Z');

    const failures = [
      mockRecord(
        'stripe_failed_payment',
        'event',
        { customer_id: 'cus_1', amount: 19800, currency: 'usd', failure_code: 'card_declined' },
        '2026-09-20T10:00:00Z',
      ),
      mockRecord(
        'stripe_failed_payment',
        'event',
        { customer_id: 'cus_2', amount: 5000, currency: 'usd', failure_code: 'insufficient_funds' },
        '2026-09-25T10:00:00Z',
      ),
    ];

    const charges = [
      mockRecord(
        'stripe_charge',
        'event',
        { customer_id: 'cus_1', amount: 19800, currency: 'usd', status: 'succeeded' },
        '2026-09-22T10:00:00Z', // 48h after failure
      ),
    ];

    const dunning = [
      mockRecord(
        'stripe_subscription',
        'entity',
        { customer_id: 'cus_2', mrr_normalized: 50, currency: 'usd', status: 'past_due' },
        '2026-09-26T10:00:00Z',
      ),
    ];

    const result = aggregateBillingRecoveryAnalytics(failures, charges, dunning, { now });

    expect(result.hasData).toBe(true);
    expect(result.failedPaymentsCount).toBe(2);
    expect(result.recoveredPaymentsCount).toBe(1);
    expect(result.recoveryRatePct).toBe(50);
    expect(result.avgRecoveryHours).toBe(48);
    expect(result.recoveredRevenueTotal).toBe(198);
    expect(result.rolling30dRecovered).toBe(198);
    expect(result.rolling90dRecovered).toBe(198);
    expect(result.atRiskMrrTotal).toBe(50);
    expect(result.activeDunningCount).toBe(1);
  });

  it('handles clean empty state when no records are present', () => {
    const result = aggregateBillingRecoveryAnalytics([], [], []);
    expect(result.hasData).toBe(false);
    expect(result.recoveredRevenueTotal).toBe(0);
    expect(result.recoveryRatePct).toBe(0);
    expect(result.avgRecoveryHours).toBe(0);
    expect(result.recentRecoveries).toHaveLength(0);
  });
});
