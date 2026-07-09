import { describe, expect, it } from 'vitest';
import { mapChargeToEventRecords, mapInvoiceToEventRecord, mapRefundToEventRecord, mapSubscriptionToEntityRecord } from './mappers';
import type { StripeCharge, StripeInvoice, StripeRefund, StripeSubscription } from './types';

const SUCCEEDED_CHARGE: StripeCharge = {
  id: 'ch_1',
  object: 'charge',
  amount: 5000,
  currency: 'usd',
  customer: 'cus_1',
  status: 'succeeded',
  refunded: false,
  amount_refunded: 0,
  created: 1_700_000_000,
};

describe('mapChargeToEventRecords', () => {
  it('maps a succeeded charge to exactly one stripe_charge event', () => {
    const records = mapChargeToEventRecords(SUCCEEDED_CHARGE);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      event_id: 'stripe:charge:ch_1',
      event: 'stripe_charge',
      ts: '2023-11-14T22:13:20.000Z',
      properties: {
        charge_id: 'ch_1',
        customer_id: 'cus_1',
        amount: 5000,
        currency: 'usd',
        status: 'succeeded',
        refunded: false,
        amount_refunded: 0,
      },
    });
  });

  it('also emits a stripe_failed_payment event for a failed charge, derived from the same object', () => {
    const failed: StripeCharge = {
      ...SUCCEEDED_CHARGE,
      status: 'failed',
      failure_code: 'card_declined',
      failure_message: 'Your card was declined.',
    };
    const records = mapChargeToEventRecords(failed);
    expect(records).toHaveLength(2);
    expect(records[0].event).toBe('stripe_charge');
    expect(records[1]).toEqual({
      event_id: 'stripe:failed_payment:ch_1',
      event: 'stripe_failed_payment',
      ts: '2023-11-14T22:13:20.000Z',
      properties: {
        charge_id: 'ch_1',
        customer_id: 'cus_1',
        amount: 5000,
        currency: 'usd',
        failure_code: 'card_declined',
        failure_message: 'Your card was declined.',
      },
    });
  });

  it('falls back to an empty customer_id for a guest charge with no customer', () => {
    const guestCharge: StripeCharge = { ...SUCCEEDED_CHARGE, customer: null };
    const [record] = mapChargeToEventRecords(guestCharge);
    expect((record.properties as Record<string, unknown>).customer_id).toBe('');
  });
});

describe('mapInvoiceToEventRecord', () => {
  it('maps an invoice to a stripe_invoice event', () => {
    const invoice: StripeInvoice = {
      id: 'in_1',
      object: 'invoice',
      customer: 'cus_1',
      subscription: 'sub_1',
      status: 'paid',
      amount_due: 2000,
      amount_paid: 2000,
      currency: 'usd',
      created: 1_700_000_000,
    };
    expect(mapInvoiceToEventRecord(invoice)).toEqual({
      event_id: 'stripe:invoice:in_1',
      event: 'stripe_invoice',
      ts: '2023-11-14T22:13:20.000Z',
      properties: {
        invoice_id: 'in_1',
        customer_id: 'cus_1',
        subscription_id: 'sub_1',
        status: 'paid',
        amount_due: 2000,
        amount_paid: 2000,
        currency: 'usd',
      },
    });
  });
});

describe('mapRefundToEventRecord', () => {
  it('maps a refund to a stripe_refund event', () => {
    const refund: StripeRefund = {
      id: 're_1',
      object: 'refund',
      charge: 'ch_1',
      amount: 500,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
      created: 1_700_000_000,
    };
    expect(mapRefundToEventRecord(refund)).toEqual({
      event_id: 'stripe:refund:re_1',
      event: 'stripe_refund',
      ts: '2023-11-14T22:13:20.000Z',
      properties: {
        refund_id: 're_1',
        charge_id: 'ch_1',
        amount: 500,
        currency: 'usd',
        status: 'succeeded',
        reason: 'requested_by_customer',
      },
    });
  });
});

describe('mapSubscriptionToEntityRecord', () => {
  const SUBSCRIPTION: StripeSubscription = {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    currency: 'usd',
    current_period_end: 1_700_000_000,
    cancel_at_period_end: false,
    canceled_at: null,
    created: 1_690_000_000,
    items: { data: [{ price: { unit_amount: 24000, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } }, quantity: 1 }] },
  };

  it('maps a subscription to a stripe_subscription entity including mrr_normalized', () => {
    expect(mapSubscriptionToEntityRecord(SUBSCRIPTION)).toEqual({
      id: 'sub_1',
      attributes: {
        customer_id: 'cus_1',
        status: 'active',
        currency: 'usd',
        mrr_normalized: 2000,
        current_period_end: '2023-11-14T22:13:20.000Z',
        cancel_at_period_end: false,
      },
    });
  });

  it('includes canceled_at only when the subscription has actually been canceled', () => {
    const canceled: StripeSubscription = { ...SUBSCRIPTION, canceled_at: 1_695_000_000 };
    const record = mapSubscriptionToEntityRecord(canceled);
    expect((record.attributes as Record<string, unknown>).canceled_at).toBe('2023-09-18T01:20:00.000Z');
  });
});
