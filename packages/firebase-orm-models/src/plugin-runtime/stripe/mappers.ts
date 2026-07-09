import { computeSubscriptionMrrNormalized } from './mrr';
import {
  STRIPE_CHARGE_EVENT_NAME,
  STRIPE_FAILED_PAYMENT_EVENT_NAME,
  STRIPE_INVOICE_EVENT_NAME,
  STRIPE_REFUND_EVENT_NAME,
} from './schemas';
import type { StripeCharge, StripeInvoice, StripeRefund, StripeSubscription } from './types';

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Maps one Stripe charge to its `stripe_charge` event record, plus — when
 * the charge failed — a second, independent `stripe_failed_payment` event
 * derived from the same object (plan `13 §E8.1` lists "failed payments" as
 * its own commerce schema; Stripe has no separate "failed payment" API
 * resource, a failed charge *is* the failed-payment fact).
 */
export function mapChargeToEventRecords(charge: StripeCharge): Record<string, unknown>[] {
  const ts = toIso(charge.created);
  const records: Record<string, unknown>[] = [
    {
      event_id: `stripe:charge:${charge.id}`,
      event: STRIPE_CHARGE_EVENT_NAME,
      ts,
      properties: {
        charge_id: charge.id,
        customer_id: charge.customer ?? '',
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        refunded: charge.refunded,
        amount_refunded: charge.amount_refunded,
      },
    },
  ];

  if (charge.status === 'failed') {
    records.push({
      event_id: `stripe:failed_payment:${charge.id}`,
      event: STRIPE_FAILED_PAYMENT_EVENT_NAME,
      ts,
      properties: {
        charge_id: charge.id,
        customer_id: charge.customer ?? '',
        amount: charge.amount,
        currency: charge.currency,
        failure_code: charge.failure_code ?? '',
        failure_message: charge.failure_message ?? '',
      },
    });
  }

  return records;
}

export function mapInvoiceToEventRecord(invoice: StripeInvoice): Record<string, unknown> {
  return {
    event_id: `stripe:invoice:${invoice.id}`,
    event: STRIPE_INVOICE_EVENT_NAME,
    ts: toIso(invoice.created),
    properties: {
      invoice_id: invoice.id,
      customer_id: invoice.customer ?? '',
      subscription_id: invoice.subscription ?? '',
      status: invoice.status,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
    },
  };
}

export function mapRefundToEventRecord(refund: StripeRefund): Record<string, unknown> {
  return {
    event_id: `stripe:refund:${refund.id}`,
    event: STRIPE_REFUND_EVENT_NAME,
    ts: toIso(refund.created),
    properties: {
      refund_id: refund.id,
      charge_id: refund.charge,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason ?? '',
    },
  };
}

/** Maps one Stripe subscription to its `stripe_subscription` entity record — current-state, keyed by the subscription's own id (an entity landing re-lands the same id on every sync, overwriting the prior snapshot downstream). */
export function mapSubscriptionToEntityRecord(subscription: StripeSubscription): Record<string, unknown> {
  return {
    id: subscription.id,
    attributes: {
      customer_id: subscription.customer,
      status: subscription.status,
      currency: subscription.currency,
      mrr_normalized: computeSubscriptionMrrNormalized(subscription),
      current_period_end: toIso(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      ...(subscription.canceled_at !== null ? { canceled_at: toIso(subscription.canceled_at) } : {}),
    },
  };
}
