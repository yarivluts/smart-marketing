import type { IngestBatchInput } from '../../services/ingest.service';
import {
  mapChargeToEventRecords,
  mapInvoiceToEventRecord,
  mapRefundToEventRecord,
  mapSubscriptionToEntityRecord,
  mapStripeSubscriptionToCancellationReasonRecord,
} from './mappers';
import { STRIPE_SUBSCRIPTION_ENTITY_NAME } from './schemas';
import type { StripeCharge, StripeInvoice, StripeRefund, StripeSubscription, StripeWebhookEvent } from './types';

/**
 * Maps one verified Stripe webhook event into one or more `IngestBatchInput` batches.
 * When a subscription is canceled or updated with customer cancellation details (exit feedback / reason),
 * this yields both the updated subscription entity batch and the `cancellation_reason` event batch (KAN-306).
 */
export function mapStripeWebhookEventToIngestInputs(event: StripeWebhookEvent): IngestBatchInput[] {
  const inputs: IngestBatchInput[] = [];

  if (event.type.startsWith('charge.')) {
    inputs.push({ kind: 'event', records: mapChargeToEventRecords(event.data.object as unknown as StripeCharge) });
    return inputs;
  }
  if (event.type.startsWith('invoice.')) {
    inputs.push({ kind: 'event', records: [mapInvoiceToEventRecord(event.data.object as unknown as StripeInvoice)] });
    return inputs;
  }
  if (event.type.startsWith('refund.')) {
    inputs.push({ kind: 'event', records: [mapRefundToEventRecord(event.data.object as unknown as StripeRefund)] });
    return inputs;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object as unknown as StripeSubscription;
    inputs.push({
      kind: 'entity',
      type: STRIPE_SUBSCRIPTION_ENTITY_NAME,
      records: [mapSubscriptionToEntityRecord(sub)],
    });

    const cancelRecord = mapStripeSubscriptionToCancellationReasonRecord(sub);
    if (cancelRecord !== null) {
      inputs.push({
        kind: 'event',
        records: [cancelRecord],
      });
    }

    return inputs;
  }

  return inputs;
}

/**
 * Maps one verified Stripe webhook event (KAN-49, plan `13 §E8.1`:
 * "webhooks") to the same `IngestBatchInput` shape a backfill sync batch
 * produces — real-time landing is just another way the same records arrive,
 * not a separate mapping. Returns `null` for an event type this connector
 * doesn't care about (Stripe sends dozens of event types); the caller must
 * still acknowledge (HTTP 200) an ignored event rather than erroring, the
 * standard webhook-handler convention — an unhandled type is not a failure.
 */
export function mapStripeWebhookEventToIngestInput(event: StripeWebhookEvent): IngestBatchInput | null {
  const inputs = mapStripeWebhookEventToIngestInputs(event);
  return inputs.length > 0 ? inputs[0] : null;
}
