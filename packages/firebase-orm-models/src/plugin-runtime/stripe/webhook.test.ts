import { describe, expect, it } from 'vitest';
import { mapStripeWebhookEventToIngestInput, mapStripeWebhookEventToIngestInputs } from './webhook';
import type { StripeWebhookEvent } from './types';

function event(type: string, object: Record<string, unknown>): StripeWebhookEvent {
  return { id: 'evt_1', object: 'event', type, created: 1_700_000_000, data: { object } };
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

describe('mapStripeWebhookEventToIngestInput', () => {
  it('maps a charge.* event to an event-kind input', () => {
    const input = mapStripeWebhookEventToIngestInput(event('charge.succeeded', CHARGE));
    expect(input).not.toBeNull();
    expect(input!.kind).toBe('event');
    expect((input as { records: Record<string, unknown>[] }).records[0]).toMatchObject({ event: 'stripe_charge' });
  });

  it('maps a failed charge.* event to two records (charge + failed_payment)', () => {
    const input = mapStripeWebhookEventToIngestInput(event('charge.failed', { ...CHARGE, status: 'failed' }));
    expect((input as { records: Record<string, unknown>[] }).records.map((r) => r.event)).toEqual([
      'stripe_charge',
      'stripe_failed_payment',
    ]);
  });

  it('maps an invoice.* event to an event-kind input', () => {
    const input = mapStripeWebhookEventToIngestInput(
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
    expect(input).toEqual({
      kind: 'event',
      records: [expect.objectContaining({ event: 'stripe_invoice' })],
    });
  });

  it('maps a refund.* event to an event-kind input', () => {
    const input = mapStripeWebhookEventToIngestInput(
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
    expect(input).toEqual({ kind: 'event', records: [expect.objectContaining({ event: 'stripe_refund' })] });
  });

  it('maps a customer.subscription.* event to an entity-kind input', () => {
    const input = mapStripeWebhookEventToIngestInput(
      event('customer.subscription.updated', {
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
      }),
    );
    expect(input).toMatchObject({ kind: 'entity', type: 'stripe_subscription' });
  });

  it('returns null for an event type this connector does not handle', () => {
    expect(mapStripeWebhookEventToIngestInput(event('payment_intent.created', {}))).toBeNull();
  });

  it('maps a subscription cancellation with exit survey feedback to both entity and cancellation_reason batches', () => {
    const inputs = mapStripeWebhookEventToIngestInputs(
      event('customer.subscription.deleted', {
        id: 'sub_cancel_1',
        object: 'subscription',
        customer: 'cus_123',
        status: 'canceled',
        currency: 'usd',
        current_period_end: 1_700_100_000,
        cancel_at_period_end: false,
        canceled_at: 1_700_050_000,
        created: 1_700_000_000,
        items: { data: [{ price: { unit_amount: 5000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] },
        cancellation_details: {
          feedback: 'too_expensive',
          comment: 'Pricing is too high for our team',
          reason: 'cancellation_requested',
        },
      }),
    );

    expect(inputs).toHaveLength(2);
    expect(inputs[0].kind).toBe('entity');
    expect(inputs[0]).toMatchObject({ type: 'stripe_subscription' });

    expect(inputs[1].kind).toBe('event');
    const cancelRecords = (inputs[1] as any).records;
    expect(cancelRecords).toHaveLength(1);
    expect(cancelRecords[0].schema_name).toBe('cancellation_reason');
    expect(cancelRecords[0].payload.properties).toMatchObject({
      reason_code: 'too_expensive',
      comment: 'Pricing is too high for our team',
      customer_id: 'cus_123',
    });
  });
});
