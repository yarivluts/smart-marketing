import { checkRecordEnvelope, type RawRecordModel } from '@growthos/firebase-orm-models';

function stringField(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' ? value : null;
}

function numberField(payload: Record<string, unknown>, field: string): number | null {
  const value = payload[field];
  return typeof value === 'number' ? value : null;
}

/**
 * A plain, serializable projection of one dunning `stripe_subscription` entity `RawRecordModel`
 * (KAN-94). Same "client components can only ever receive plain data, never an `@arbel/firebase-orm`
 * model instance" reasoning as `toChurnFeedEntryView`/`toBillingOpsFeedEntryView`. `status` is always
 * `past_due` or `unpaid` in practice since `listRecentDunningSubscriptionsForProject` only ever returns
 * records matching one of those two, but is typed as a plain string (not a literal union) the same way
 * every other feed view's raw-field passthrough is, rather than re-declaring Stripe's own status enum
 * here.
 */
export interface DunningFeedEntryView {
  id: string;
  environmentId: string;
  clientId: string;
  customerId: string | null;
  status: string | null;
  currency: string | null;
  mrrNormalized: number | null;
  planInterval: string | null;
  currentPeriodEnd: string | null;
  landedAt: string;
}

export function toDunningFeedEntryView(record: RawRecordModel): DunningFeedEntryView {
  // Same envelope-unwrap fix `toChurnFeedEntryView`/`toBillingOpsFeedEntryView` already needed: a
  // landed `RawRecordModel.payload` is the whole ingest envelope, not a flat field map.
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
    landedAt: record.landed_at,
  };
}

/** Translation key for one entry's dunning status label — every caller must render through `t()`, never a hard-coded UI string (CLAUDE.md). */
export function dunningFeedEntryStatusLabelKey(status: string | null): string {
  switch (status) {
    case 'unpaid':
      return 'statusUnpaid';
    case 'past_due':
      return 'statusPastDue';
    default:
      return 'statusUnknown';
  }
}
