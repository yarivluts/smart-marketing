import { CANCELLATION_REASON_SCHEMA_NAME, type CancellationReasonCode } from '@growthos/shared';
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

/**
 * Maps one Stripe subscription to its `stripe_subscription` entity record —
 * current-state, keyed by the subscription's own id (an entity landing
 * re-lands the same id on every sync, overwriting the prior snapshot
 * downstream). Every sync's landing is kept in the raw ingest history
 * (only the *entity* current-state table dedupes to the latest), so
 * `dim_subscription`/`fact_subscription_event`/`fact_revenue_event`
 * (`packages/dbt-transform`) can replay a subscription's lifecycle by
 * diffing consecutive landed snapshots.
 *
 * `started_at` is the subscription's own Stripe `created` timestamp (not a
 * sync/landing time) — `dim_subscription`'s `trials_active` metric buckets
 * by it, so it must reflect when the subscription itself began, not when
 * this connector happened to first observe it. `plan_interval` is the
 * billing interval (`month`/`year`/...) of the subscription's first item —
 * a real, if coarse, "plan" dimension `mrr_movements` can break down by,
 * since Stripe's own API gives this connector no plan/product display name
 * to work with (see `StripeSubscriptionItem`'s own minimal shape).
 */
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
      started_at: toIso(subscription.created),
      plan_interval: subscription.items.data[0]?.price.recurring.interval ?? '',
      ...(subscription.canceled_at !== null ? { canceled_at: toIso(subscription.canceled_at) } : {}),
    },
  };
}

/**
 * Stripe's Customer Portal exit-survey `feedback` value -> this codebase's `CancellationReasonCode`
 * taxonomy (`@growthos/shared`). A value Stripe adds later, or one with no counterpart here, falls to
 * `other` - the taxonomy's own escape hatch - rather than being guessed into a specific bucket.
 */
export function mapStripeCancellationFeedbackToReasonCode(feedback: string): CancellationReasonCode {
  switch (feedback) {
    case 'too_expensive':
      return 'too_expensive';
    case 'missing_features':
      return 'missing_features';
    case 'switched_service':
      return 'switched_competitor';
    case 'unused':
      return 'not_using_enough';
    case 'customer_service':
      return 'poor_support';
    case 'too_complex':
    case 'low_quality':
      return 'technical_issues';
    default:
      return 'other';
  }
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Maps a canceled (or scheduled-to-cancel) Stripe subscription's `cancellation_details` to one
 * `cancellation_reason` event (KAN-306) - the same schema a cancel flow or exit survey sends through
 * the tracking SDK (`CANCELLATION_REASON_SCHEMA_FIELDS`: `reason_code` + optional `comment`, with the
 * implicit `customer_id` envelope field), so a Stripe-reported reason shows up on the Churn Reasons page
 * beside every other one. Returns `null` when there is no reason to record:
 *
 * - no `canceled_at`: the subscription is not canceled (or its cancellation was undone), and there is
 *   no real cancellation time to date the event by - a reason is never stamped with "now";
 * - no `cancellation_details`, or nothing in it but `reason: 'cancellation_requested'`: the customer
 *   canceled without saying why, which is a cancellation, not a reason.
 *
 * Code precedence: `reason: 'payment_failed'` -> `payment_failed` (involuntary churn: Stripe canceled
 * after retries ran out, whatever survey state exists); otherwise the customer's survey `feedback`;
 * otherwise `other` when there is still something to record (a free-text comment, or a dispute-driven
 * cancellation).
 *
 * `event_id` is `stripe:cancellation_reason:<subscription id>:<canceled_at>`. Stripe sends
 * `customer.subscription.updated` repeatedly for one subscription (and `.deleted` when a scheduled
 * cancellation takes effect), all carrying the same `canceled_at` for the same cancellation, so every
 * re-delivery claims the same ingest dedup slot and lands once. A subscription reactivated and then
 * canceled again gets a new `canceled_at`, hence a new event.
 */
export function mapStripeSubscriptionToCancellationReasonRecord(subscription: StripeSubscription): Record<string, unknown> | null {
  if (subscription.canceled_at === null || subscription.canceled_at === undefined) return null;
  const details = subscription.cancellation_details;
  if (!details) return null;

  const feedback = nonEmpty(details.feedback);
  const comment = nonEmpty(details.comment);
  const reason = nonEmpty(details.reason);

  let reasonCode: CancellationReasonCode;
  if (reason === 'payment_failed') {
    reasonCode = 'payment_failed';
  } else if (feedback !== null) {
    reasonCode = mapStripeCancellationFeedbackToReasonCode(feedback);
  } else if (comment !== null || reason === 'payment_disputed') {
    reasonCode = 'other';
  } else {
    return null;
  }

  const customerId = nonEmpty(subscription.customer);
  return {
    event_id: `stripe:cancellation_reason:${subscription.id}:${subscription.canceled_at}`,
    event: CANCELLATION_REASON_SCHEMA_NAME,
    ts: toIso(subscription.canceled_at),
    properties: {
      reason_code: reasonCode,
      ...(comment !== null ? { comment } : {}),
      ...(customerId !== null ? { customer_id: customerId } : {}),
    },
  };
}
