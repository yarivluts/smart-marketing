import { describe, expect, it } from 'vitest';
import type { RawRecordModel } from '@growthos/firebase-orm-models';
import { dunningFeedEntryStatusLabelKey, toDunningFeedEntryView } from './dunning-feed-view';

function rawRecord(attributes: Record<string, unknown>): RawRecordModel {
  return {
    id: 'raw-1',
    environment_id: 'env-prod',
    client_id: 'sub-1',
    schema_name: 'stripe_subscription',
    landed_at: '2026-08-22T12:00:00Z',
    kind: 'entity',
    // A real landed `payload` is the whole ingest envelope, not a flat field map -- an entity's
    // declared fields live under `attributes` (see `toDunningFeedEntryView`'s own doc comment).
    payload: { id: 'sub-1', attributes },
  } as unknown as RawRecordModel;
}

describe('toDunningFeedEntryView', () => {
  it('maps a past_due subscription record', () => {
    const view = toDunningFeedEntryView(
      rawRecord({
        customer_id: 'cus_1',
        status: 'past_due',
        currency: 'usd',
        mrr_normalized: 2900,
        plan_interval: 'month',
        current_period_end: '2026-08-30T00:00:00Z',
      }),
    );
    expect(view).toEqual({
      id: 'raw-1',
      environmentId: 'env-prod',
      clientId: 'sub-1',
      customerId: 'cus_1',
      status: 'past_due',
      currency: 'usd',
      mrrNormalized: 2900,
      planInterval: 'month',
      currentPeriodEnd: '2026-08-30T00:00:00Z',
      landedAt: '2026-08-22T12:00:00Z',
    });
  });

  it('maps an unpaid subscription record', () => {
    const view = toDunningFeedEntryView(rawRecord({ customer_id: 'cus_2', status: 'unpaid', currency: 'usd', mrr_normalized: 1900 }));
    expect(view.status).toBe('unpaid');
    expect(view.mrrNormalized).toBe(1900);
  });

  it('falls back to null for a missing/wrongly-typed field rather than throwing', () => {
    const view = toDunningFeedEntryView(rawRecord({ mrr_normalized: 'not-a-number' }));
    expect(view.mrrNormalized).toBeNull();
    expect(view.customerId).toBeNull();
    expect(view.status).toBeNull();
  });
});

describe('dunningFeedEntryStatusLabelKey', () => {
  it('maps each known dunning status to its own label key', () => {
    expect(dunningFeedEntryStatusLabelKey('past_due')).toBe('statusPastDue');
    expect(dunningFeedEntryStatusLabelKey('unpaid')).toBe('statusUnpaid');
  });

  it('falls back to an unknown-status label key for anything else', () => {
    expect(dunningFeedEntryStatusLabelKey('active')).toBe('statusUnknown');
    expect(dunningFeedEntryStatusLabelKey(null)).toBe('statusUnknown');
  });
});
