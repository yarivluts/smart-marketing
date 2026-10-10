import type { IngestBatchInput } from '../../services/ingest.service';
import {
  mapChargeToEventRecords,
  mapInvoiceToEventRecord,
  mapRefundToEventRecord,
  mapStripeSubscriptionToCancellationReasonRecord,
  mapSubscriptionToEntityRecord,
} from './mappers';
import { STRIPE_SUBSCRIPTION_ENTITY_NAME } from './schemas';
import type { StripeCharge, StripeInvoice, StripeRefund, StripeSubscription, StripeWebhookEvent } from './types';

/**
 * Maps one verified Stripe webhook event (KAN-49, plan `13 §E8.1`:
 * "webhooks") to the same `IngestBatchInput` shape(s) a backfill sync batch
 * produces — real-time landing is just another way the same records arrive,
 * not a separate mapping. Returns an empty list for an event type this
 * connector doesn't care about (Stripe sends dozens of event types); the
 * caller must still acknowledge (HTTP 200) an ignored event rather than
 * erroring, the standard webhook-handler convention — an unhandled type is
 * not a failure.
 *
 * Usually one batch. A `customer.subscription.*` event whose subscription
 * carries a cancellation reason (KAN-306) yields two: the subscription's
 * entity snapshot and its `cancellation_reason` event — two batches because
 * one `IngestBatchInput` carries a single `kind`.
 */
export function mapStripeWebhookEventToIngestInputs(event: StripeWebhookEvent): IngestBatchInput[] {
  if (event.type.startsWith('charge.')) {
    return [{ kind: 'event', records: mapChargeToEventRecords(event.data.object as unknown as StripeCharge) }];
  }
  if (event.type.startsWith('invoice.')) {
    return [{ kind: 'event', records: [mapInvoiceToEventRecord(event.data.object as unknown as StripeInvoice)] }];
  }
  if (event.type.startsWith('refund.')) {
    return [{ kind: 'event', records: [mapRefundToEventRecord(event.data.object as unknown as StripeRefund)] }];
  }
  if (event.type.startsWith('customer.subscription.')) {
    const subscription = event.data.object as unknown as StripeSubscription;
    const inputs: IngestBatchInput[] = [
      { kind: 'entity', type: STRIPE_SUBSCRIPTION_ENTITY_NAME, records: [mapSubscriptionToEntityRecord(subscription)] },
    ];
    const cancellationReason = mapStripeSubscriptionToCancellationReasonRecord(subscription);
    if (cancellationReason !== null) {
      inputs.push({ kind: 'event', records: [cancellationReason] });
    }
    return inputs;
  }
  return [];
}
