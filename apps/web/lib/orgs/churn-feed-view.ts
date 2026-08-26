import { checkRecordEnvelope, type RawRecordModel } from '@growthos/firebase-orm-models';
import { booleanField, numberField, stringField } from './raw-record-field-view';

/**
 * A plain, serializable projection of one churned/at-risk `stripe_subscription` entity
 * `RawRecordModel` (KAN-81). Same "client components can only ever receive plain data, never an
 * `@arbel/firebase-orm` model instance" reasoning as `toBillingOpsFeedEntryView`. `mrrNormalized` is
 * surfaced exactly as landed (no currency-formatting convention exists elsewhere in this codebase
 * either — see that view's own note).
 */
export interface ChurnFeedEntryView {
  id: string;
  environmentId: string;
  clientId: string;
  customerId: string | null;
  status: string | null;
  currency: string | null;
  mrrNormalized: number | null;
  planInterval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  landedAt: string;
}

export function toChurnFeedEntryView(record: RawRecordModel): ChurnFeedEntryView {
  // A landed `RawRecordModel.payload` is the *whole* ingest envelope (an entity's own `id` alongside
  // its `attributes`), not a flat map of the schema's declared fields — same bug class
  // `record-feed-view.ts`'s `toRecordFeedEntryView` fix (KAN-81 slice 6, PR #247) and
  // `billing-ops-view.ts`'s `toBillingOpsFeedEntryView` already correct. Reading `record.payload`
  // directly here meant every field below silently rendered blank for any subscription record landed
  // through the real Stripe plugin.
  const payload = checkRecordEnvelope(record.kind, record.payload).fieldsToValidate;
  return {
    id: record.id,
    environmentId: record.environment_id,
    clientId: record.client_id,
    customerId: stringField(payload, 'customer_id'),
    status: stringField(payload, 'status'),
    currency: stringField(payload, 'currency'),
    mrrNormalized: numberField(payload, 'mrr_normalized'),
    planInterval: stringField(payload, 'plan_interval'),
    currentPeriodEnd: stringField(payload, 'current_period_end'),
    cancelAtPeriodEnd: booleanField(payload, 'cancel_at_period_end'),
    canceledAt: stringField(payload, 'canceled_at'),
    landedAt: record.landed_at,
  };
}
