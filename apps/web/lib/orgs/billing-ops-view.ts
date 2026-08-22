import { BILLING_OPS_FEED_EVENT_SCHEMA_NAMES, type RawRecordModel } from '@growthos/firebase-orm-models';

const [CHARGE_SCHEMA_NAME, FAILED_PAYMENT_SCHEMA_NAME, REFUND_SCHEMA_NAME] = BILLING_OPS_FEED_EVENT_SCHEMA_NAMES;

/** One entry type per billing-ops feed row (KAN-80) — mirrors `BILLING_OPS_FEED_EVENT_SCHEMA_NAMES`' three schema names. */
export type BillingOpsFeedEntryType = 'charge' | 'failed_payment' | 'refund';

function billingOpsFeedEntryType(schemaName: string): BillingOpsFeedEntryType {
  switch (schemaName) {
    case FAILED_PAYMENT_SCHEMA_NAME:
      return 'failed_payment';
    case REFUND_SCHEMA_NAME:
      return 'refund';
    case CHARGE_SCHEMA_NAME:
    default:
      return 'charge';
  }
}

function stringField(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' ? value : null;
}

function numberField(payload: Record<string, unknown>, field: string): number | null {
  const value = payload[field];
  return typeof value === 'number' ? value : null;
}

/**
 * A plain, serializable projection of one billing `RawRecordModel` (KAN-80). Same "client components
 * can only ever receive plain data, never an `@arbel/firebase-orm` model instance" reasoning as
 * `toIngestBatchView`. Amounts/currency are surfaced exactly as landed (Stripe's own smallest-unit
 * convention, e.g. cents) rather than guessed at a decimal conversion — no currency-formatting
 * convention exists elsewhere in this codebase yet (`mrr_normalized` is displayed unconverted too),
 * and guessing one here (breaking for zero-decimal currencies like JPY) would be worse than showing
 * the raw value with its currency code alongside it.
 */
export interface BillingOpsFeedEntryView {
  id: string;
  type: BillingOpsFeedEntryType;
  environmentId: string;
  clientId: string;
  amount: number | null;
  currency: string | null;
  customerId: string | null;
  status: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  refundReason: string | null;
  landedAt: string;
}

export function toBillingOpsFeedEntryView(record: RawRecordModel): BillingOpsFeedEntryView {
  const payload = record.payload;
  return {
    id: record.id,
    type: billingOpsFeedEntryType(record.schema_name),
    environmentId: record.environment_id,
    clientId: record.client_id,
    amount: numberField(payload, 'amount'),
    currency: stringField(payload, 'currency'),
    customerId: stringField(payload, 'customer_id'),
    status: stringField(payload, 'status'),
    failureCode: stringField(payload, 'failure_code'),
    failureMessage: stringField(payload, 'failure_message'),
    refundReason: stringField(payload, 'reason'),
    landedAt: record.landed_at,
  };
}

/** Translation key for one entry's type label — every caller must render through `t()`, never a hard-coded UI string (CLAUDE.md). */
export function billingOpsFeedEntryTypeLabelKey(type: BillingOpsFeedEntryType): string {
  switch (type) {
    case 'failed_payment':
      return 'typeFailedPayment';
    case 'refund':
      return 'typeRefund';
    case 'charge':
      return 'typeCharge';
  }
}
