import { describe, expect, it } from 'vitest';
import { mapStripeWebhookEventToIngestInputs } from './webhook';
import type { StripeWebhookEvent } from './types';

function event(type: string, object: Record<string, unknown>, id = 'evt_1'): StripeWebhookEvent {
  return { id, object: 'event', type, created: 1_700_000_000, data: { object } };
}

const CHARGE = {
  id: 'ch_1',
  object: 'charge',
  amount: 1000,
  currency: 'usd',
  customer: 'cus_1',
  status: 'succeeded',
  refunded: false,
  amount_refunded: 0,
  created: 1_700_000_000,
};

const SUBSCRIPTION = {
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_1',
  status: 'active',
  currency: 'usd',
  current_period_end: 1_700_100_000,
  cancel_at_period_end: false,
  canceled_at: null,
  created: 1_700_000_000,
  items: { data: [{ price: { unit_amount: 2000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] },
};

const CANCELED_SUBSCRIPTION = {
  ...SUBSCRIPTION,
  status: 'canceled',
  canceled_at: 1_700_050_000,
  cancellation_details: { reason: 'cancellation_requested', feedback: 'too_expensive', comment: 'Pricing is too high for our team' },
};

function records(input: unknown): Record<string, unknown>[] {
  return (input as { records: Record<string, unknown>[] }).records;
}

describe('mapStripeWebhookEventToIngestInputs', () => {
  it('maps a charge.* event to one event-kind input', () => {
    const inputs = mapStripeWebhookEventToIngestInputs(event('charge.succeeded', CHARGE));
    expect(inputs).toHaveLength(1);
    expect(inputs[0].kind).toBe('event');
    expect(records(inputs[0])[0]).toMatchObject({ event: 'stripe_charge' });
  });

  it('maps a failed charge.* event to two records (charge + failed_payment)', () => {
    const [input] = mapStripeWebhookEventToIngestInputs(event('charge.failed', { ...CHARGE, status: 'failed' }));
    expect(records(input).map((r) => r.event)).toEqual(['stripe_charge', 'stripe_failed_payment']);
  });

  it('maps an invoice.* event to an event-kind input', () => {
    const inputs = mapStripeWebhookEventToIngestInputs(
      event('invoice.payment_failed', {
        id: 'in_1',
        object: 'invoice',
        customer: 'cus_1',
        subscription: null,
        status: 'open',
        amount_due: 100,
        amount_paid: 0,
        currency: 'usd',
        created: 1_700_000_000,
      }),
    );
    expect(inputs).toEqual([{ kind: 'event', records: [expect.objectContaining({ event: 'stripe_invoice' })] }]);
  });

  it('maps a refund.* event to an event-kind input', () => {
    const inputs = mapStripeWebhookEventToIngestInputs(
      event('refund.created', {
        id: 're_1',
        object: 'refund',
        charge: 'ch_1',
        amount: 100,
        currency: 'usd',
        status: 'succeeded',
        reason: null,
        created: 1_700_000_000,
      }),
    );
    expect(inputs).toEqual([{ kind: 'event', records: [expect.objectContaining({ event: 'stripe_refund' })] }]);
  });

  it('maps a customer.subscription.* event without a cancellation to only its entity input', () => {
    const inputs = mapStripeWebhookEventToIngestInputs(event('customer.subscription.updated', SUBSCRIPTION));
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ kind: 'entity', type: 'stripe_subscription' });
  });

  it('adds a cancellation_reason event batch after the entity batch when the subscription carries one', () => {
    const inputs = mapStripeWebhookEventToIngestInputs(event('customer.subscription.deleted', CANCELED_SUBSCRIPTION));
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({ kind: 'entity', type: 'stripe_subscription' });
    expect(inputs[1].kind).toBe('event');
    expect(records(inputs[1])).toEqual([
      {
        event_id: 'stripe:cancellation_reason:sub_1:1700050000',
        event: 'cancellation_reason',
        ts: new Date(1_700_050_000 * 1000).toISOString(),
        properties: { reason_code: 'too_expensive', comment: 'Pricing is too high for our team', customer_id: 'cus_1' },
      },
    ]);
  });

  it('gives repeated deliveries of the same cancellation the same client id, so ingest dedupes them', () => {
    const scheduled = { ...CANCELED_SUBSCRIPTION, status: 'active', cancel_at_period_end: true };
    const first = mapStripeWebhookEventToIngestInputs(event('customer.subscription.updated', scheduled, 'evt_a'));
    const again = mapStripeWebhookEventToIngestInputs(event('customer.subscription.updated', scheduled, 'evt_b'));
    const takesEffect = mapStripeWebhookEventToIngestInputs(event('customer.subscription.deleted', CANCELED_SUBSCRIPTION, 'evt_c'));
    const ids = [first, again, takesEffect].map((inputs) => records(inputs[1])[0].event_id);
    expect(new Set(ids).size).toBe(1);

    const reCanceled = mapStripeWebhookEventToIngestInputs(
      event('customer.subscription.deleted', { ...CANCELED_SUBSCRIPTION, canceled_at: 1_700_090_000 }, 'evt_d'),
    );
    expect(records(reCanceled[1])[0].event_id).not.toBe(ids[0]);
  });

  it('returns no inputs for an event type this connector does not handle', () => {
    expect(mapStripeWebhookEventToIngestInputs(event('payment_intent.created', {}))).toEqual([]);
  });
});
