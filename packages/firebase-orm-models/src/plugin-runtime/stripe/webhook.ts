import type { IngestBatchInput } from '../../services/ingest.service';
import { mapChargeToEventRecords, mapInvoiceToEventRecord, mapRefundToEventRecord, mapSubscriptionToEntityRecord } from './mappers';
import { STRIPE_SUBSCRIPTION_ENTITY_NAME } from './schemas';
import type { StripeCharge, StripeInvoice, StripeRefund, StripeSubscription, StripeWebhookEvent } from './types';

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
  if (event.type.startsWith('charge.')) {
    return { kind: 'event', records: mapChargeToEventRecords(event.data.object as unknown as StripeCharge) };
  }
  if (event.type.startsWith('invoice.')) {
    return { kind: 'event', records: [mapInvoiceToEventRecord(event.data.object as unknown as StripeInvoice)] };
  }
  if (event.type.startsWith('refund.')) {
    return { kind: 'event', records: [mapRefundToEventRecord(event.data.object as unknown as StripeRefund)] };
  }
  if (event.type.startsWith('customer.subscription.')) {
    return {
      kind: 'entity',
      type: STRIPE_SUBSCRIPTION_ENTITY_NAME,
      records: [mapSubscriptionToEntityRecord(event.data.object as unknown as StripeSubscription)],
    };
  }
  return null;
}
