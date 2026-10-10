import { describe, expect, it } from 'vitest';
import {
  mapChargeToEventRecords,
  mapInvoiceToEventRecord,
  mapRefundToEventRecord,
  mapStripeCancellationFeedbackToReasonCode,
  mapStripeSubscriptionToCancellationReasonRecord,
  mapSubscriptionToEntityRecord,
} from './mappers';
import { CANCELLATION_REASON_CODES, CANCELLATION_REASON_SCHEMA_NAME } from '@growthos/shared';
import type { StripeCancellationDetails, StripeCharge, StripeInvoice, StripeRefund, StripeSubscription } from './types';

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

  it('maps a subscription to a stripe_subscription entity including mrr_normalized, started_at, and plan_interval', () => {
    expect(mapSubscriptionToEntityRecord(SUBSCRIPTION)).toEqual({
      id: 'sub_1',
      attributes: {
        customer_id: 'cus_1',
        status: 'active',
        currency: 'usd',
        mrr_normalized: 2000,
        current_period_end: '2023-11-14T22:13:20.000Z',
        cancel_at_period_end: false,
        started_at: '2023-07-22T04:26:40.000Z',
        plan_interval: 'year',
      },
    });
  });

  it('includes canceled_at only when the subscription has actually been canceled', () => {
    const canceled: StripeSubscription = { ...SUBSCRIPTION, canceled_at: 1_695_000_000 };
    const record = mapSubscriptionToEntityRecord(canceled);
    expect((record.attributes as Record<string, unknown>).canceled_at).toBe('2023-09-18T01:20:00.000Z');
  });

  it('falls back to an empty plan_interval when the subscription has no items', () => {
    const noItems: StripeSubscription = { ...SUBSCRIPTION, items: { data: [] } };
    const record = mapSubscriptionToEntityRecord(noItems);
    expect((record.attributes as Record<string, unknown>).plan_interval).toBe('');
  });
});

describe('mapStripeCancellationFeedbackToReasonCode', () => {
  it.each([
    ['too_expensive', 'too_expensive'],
    ['missing_features', 'missing_features'],
    ['switched_service', 'switched_competitor'],
    ['unused', 'not_using_enough'],
    ['customer_service', 'poor_support'],
    ['too_complex', 'technical_issues'],
    ['low_quality', 'technical_issues'],
    ['other', 'other'],
    ['some_future_feedback_value', 'other'],
  ])('maps Stripe feedback %s to %s', (feedback, code) => {
    expect(mapStripeCancellationFeedbackToReasonCode(feedback)).toBe(code);
    expect(CANCELLATION_REASON_CODES).toContain(code);
  });
});

describe('mapStripeSubscriptionToCancellationReasonRecord', () => {
  const CANCELED: StripeSubscription = {
    id: 'sub_9',
    object: 'subscription',
    customer: 'cus_9',
    status: 'canceled',
    currency: 'usd',
    current_period_end: 1_700_000_000,
    cancel_at_period_end: false,
    canceled_at: 1_699_000_000,
    created: 1_690_000_000,
    items: { data: [] },
  };
  const withDetails = (details: StripeCancellationDetails | null | undefined, overrides: Partial<StripeSubscription> = {}): StripeSubscription => ({
    ...CANCELED,
    cancellation_details: details,
    ...overrides,
  });
  const properties = (subscription: StripeSubscription) =>
    (mapStripeSubscriptionToCancellationReasonRecord(subscription)?.properties ?? null) as Record<string, unknown> | null;

  it('lands in the existing cancellation_reason schema, dated by Stripe canceled_at', () => {
    expect(mapStripeSubscriptionToCancellationReasonRecord(withDetails({ feedback: 'unused' }))).toEqual({
      event_id: 'stripe:cancellation_reason:sub_9:1699000000',
      event: CANCELLATION_REASON_SCHEMA_NAME,
      ts: '2023-11-03T08:26:40.000Z',
      properties: { reason_code: 'not_using_enough', customer_id: 'cus_9' },
    });
  });

  it('maps every exit-survey feedback value through the taxonomy', () => {
    expect(properties(withDetails({ reason: 'cancellation_requested', feedback: 'switched_service' }))?.reason_code).toBe('switched_competitor');
    expect(properties(withDetails({ reason: 'cancellation_requested', feedback: 'customer_service' }))?.reason_code).toBe('poor_support');
  });

  it('maps reason payment_failed to involuntary churn, not technical_issues', () => {
    expect(properties(withDetails({ reason: 'payment_failed' }))?.reason_code).toBe('payment_failed');
    // Involuntary wins even if a stale survey answer is present.
    expect(properties(withDetails({ reason: 'payment_failed', feedback: 'too_complex' }))?.reason_code).toBe('payment_failed');
  });

  it('keeps the trimmed customer comment, and records a comment-only cancellation as other', () => {
    expect(properties(withDetails({ feedback: 'too_expensive', comment: '  Too pricey for us  ' }))).toEqual({
      reason_code: 'too_expensive',
      comment: 'Too pricey for us',
      customer_id: 'cus_9',
    });
    expect(properties(withDetails({ reason: 'cancellation_requested', comment: 'Moving to an in-house tool' }))?.reason_code).toBe('other');
  });

  it('omits a blank comment', () => {
    expect(properties(withDetails({ feedback: 'unused', comment: '   ' }))).not.toHaveProperty('comment');
  });

  it('records a dispute-driven cancellation as other', () => {
    expect(properties(withDetails({ reason: 'payment_disputed' }))?.reason_code).toBe('other');
  });

  it('returns null when there is no reason to record', () => {
    expect(mapStripeSubscriptionToCancellationReasonRecord(withDetails(undefined))).toBeNull();
    expect(mapStripeSubscriptionToCancellationReasonRecord(withDetails(null))).toBeNull();
    expect(mapStripeSubscriptionToCancellationReasonRecord(withDetails({ reason: null, feedback: null, comment: null }))).toBeNull();
    // Canceled without saying why: a cancellation, not a reason.
    expect(mapStripeSubscriptionToCancellationReasonRecord(withDetails({ reason: 'cancellation_requested' }))).toBeNull();
  });

  it('returns null for a subscription that is not canceled, instead of stamping the reason with "now"', () => {
    expect(mapStripeSubscriptionToCancellationReasonRecord(withDetails({ feedback: 'too_expensive' }, { status: 'active', canceled_at: null }))).toBeNull();
  });
});
