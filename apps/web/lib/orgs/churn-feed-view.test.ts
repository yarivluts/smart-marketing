import { describe, expect, it } from 'vitest';
import type { RawRecordModel } from '@growthos/firebase-orm-models';
import { toChurnFeedEntryView } from './churn-feed-view';

function rawRecord(attributes: Record<string, unknown>): RawRecordModel {
  return {
    id: 'raw-1',
    environment_id: 'env-prod',
    client_id: 'sub-1',
    schema_name: 'stripe_subscription',
    landed_at: '2026-08-22T12:00:00Z',
    kind: 'entity',
    // A real landed `payload` is the whole ingest envelope, not a flat field map — an entity's
    // declared fields live under `attributes` (see `toChurnFeedEntryView`'s own doc comment).
    payload: { id: 'sub-1', attributes },
  } as unknown as RawRecordModel;
}

describe('toChurnFeedEntryView', () => {
  it('maps a canceled subscription record, surfacing the cancellation fields', () => {
    const view = toChurnFeedEntryView(
      rawRecord({
        customer_id: 'cus_1',
        status: 'canceled',
        currency: 'usd',
        mrr_normalized: 0,
        plan_interval: 'month',
        current_period_end: '2026-08-30T00:00:00Z',
        cancel_at_period_end: false,
        canceled_at: '2026-08-22T11:00:00Z',
      }),
    );
    expect(view).toEqual({
      id: 'raw-1',
      environmentId: 'env-prod',
      clientId: 'sub-1',
      customerId: 'cus_1',
      status: 'canceled',
      currency: 'usd',
      mrrNormalized: 0,
      planInterval: 'month',
      currentPeriodEnd: '2026-08-30T00:00:00Z',
      cancelAtPeriodEnd: false,
      canceledAt: '2026-08-22T11:00:00Z',
      landedAt: '2026-08-22T12:00:00Z',
    });
  });

  it('maps a subscription scheduled to cancel at period end, with `canceledAt` still null', () => {
    const view = toChurnFeedEntryView(
      rawRecord({ customer_id: 'cus_2', status: 'active', currency: 'usd', mrr_normalized: 2900, cancel_at_period_end: true }),
    );
    expect(view.cancelAtPeriodEnd).toBe(true);
    expect(view.canceledAt).toBeNull();
  });

  it('falls back to null/false for a missing/wrongly-typed field rather than throwing', () => {
    const view = toChurnFeedEntryView(rawRecord({ mrr_normalized: 'not-a-number', cancel_at_period_end: 'yes' }));
    expect(view.mrrNormalized).toBeNull();
    expect(view.cancelAtPeriodEnd).toBe(false);
    expect(view.customerId).toBeNull();
    expect(view.canceledAt).toBeNull();
  });
});
