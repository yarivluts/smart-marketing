import { describe, expect, it } from 'vitest';
import type { RawRecordModel } from '@growthos/firebase-orm-models';
import { billingOpsFeedEntryTypeLabelKey, toBillingOpsFeedEntryView } from './billing-ops-view';

function rawRecord(overrides: Partial<RawRecordModel> & Pick<RawRecordModel, 'schema_name' | 'payload'>): RawRecordModel {
  return {
    id: 'raw-1',
    environment_id: 'env-prod',
    client_id: 'evt-1',
    landed_at: '2026-08-22T12:00:00Z',
    ...overrides,
  } as RawRecordModel;
}

describe('toBillingOpsFeedEntryView', () => {
  it('maps a stripe_charge record to a "charge" entry with amount/currency/customer', () => {
    const view = toBillingOpsFeedEntryView(
      rawRecord({
        schema_name: 'stripe_charge',
        payload: { charge_id: 'ch_1', customer_id: 'cus_1', amount: 5000, currency: 'usd', status: 'succeeded', refunded: false, amount_refunded: 0 },
      }),
    );
    expect(view).toEqual({
      id: 'raw-1',
      type: 'charge',
      environmentId: 'env-prod',
      clientId: 'evt-1',
      amount: 5000,
      currency: 'usd',
      customerId: 'cus_1',
      status: 'succeeded',
      failureCode: null,
      failureMessage: null,
      refundReason: null,
      landedAt: '2026-08-22T12:00:00Z',
    });
  });

  it('maps a stripe_failed_payment record to a "failed_payment" entry, surfacing the failure code/message', () => {
    const view = toBillingOpsFeedEntryView(
      rawRecord({
        schema_name: 'stripe_failed_payment',
        payload: { charge_id: 'ch_2', customer_id: 'cus_2', amount: 1200, currency: 'usd', failure_code: 'card_declined', failure_message: 'Your card was declined.' },
      }),
    );
    expect(view.type).toBe('failed_payment');
    expect(view.failureCode).toBe('card_declined');
    expect(view.failureMessage).toBe('Your card was declined.');
    expect(view.status).toBeNull();
  });

  it('maps a stripe_refund record to a "refund" entry, surfacing the refund reason under `refundReason`', () => {
    const view = toBillingOpsFeedEntryView(
      rawRecord({
        schema_name: 'stripe_refund',
        payload: { refund_id: 're_1', charge_id: 'ch_3', amount: 300, currency: 'usd', status: 'succeeded', reason: 'requested_by_customer' },
      }),
    );
    expect(view.type).toBe('refund');
    expect(view.refundReason).toBe('requested_by_customer');
  });

  it('falls back to null for a missing/wrongly-typed field rather than throwing', () => {
    const view = toBillingOpsFeedEntryView(rawRecord({ schema_name: 'stripe_charge', payload: { amount: 'not-a-number', currency: 42 } }));
    expect(view.amount).toBeNull();
    expect(view.currency).toBeNull();
    expect(view.customerId).toBeNull();
  });
});

describe('billingOpsFeedEntryTypeLabelKey', () => {
  it('returns a distinct translation key per entry type', () => {
    expect(billingOpsFeedEntryTypeLabelKey('charge')).toBe('typeCharge');
    expect(billingOpsFeedEntryTypeLabelKey('failed_payment')).toBe('typeFailedPayment');
    expect(billingOpsFeedEntryTypeLabelKey('refund')).toBe('typeRefund');
  });
});
