import type { RawRecordModel } from '@growthos/firebase-orm-models';

function stringField(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' ? value : null;
}

function numberField(payload: Record<string, unknown>, field: string): number | null {
  const value = payload[field];
  return typeof value === 'number' ? value : null;
}

function booleanField(payload: Record<string, unknown>, field: string): boolean {
  return payload[field] === true;
}

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
  const payload = record.payload;
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
