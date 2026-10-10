import type { RawRecordModel } from '../models/raw-record.model';
import { STRIPE_CHARGE_EVENT_NAME, STRIPE_FAILED_PAYMENT_EVENT_NAME } from '../plugin-runtime/stripe/schemas';
import { checkRecordEnvelope } from './ingest.service';
import { listRecentRecordsForSchemas } from './pipeline.service';

/**
 * How long after a failed payment a successful charge still counts as that payment's recovery.
 *
 * Neither landed Stripe record links a charge to the invoice or subscription it paid: `stripe_charge`
 * and `stripe_failed_payment` carry only `charge_id`/`customer_id`/`amount`/`currency` (see
 * `STRIPE_COMMERCE_SCHEMAS`), and `stripe_invoice` carries no charge id. So a recovery cannot be
 * proven by id; it is inferred from a bounded window instead. 14 days is Stripe's recommended default
 * Smart Retries policy (up to 8 retries within 2 weeks), i.e. the length of a default dunning cycle -
 * and, just as importantly, shorter than a monthly billing period, so next month's ordinary renewal
 * charge of the same amount falls outside the window and is never counted as a "recovery".
 */
export const DEFAULT_PAYMENT_RECOVERY_WINDOW_DAYS = 14;

/** How many of the most recent failed payments and charges are scanned. Same Firestore load-bounding posture as `DEFAULT_BILLING_OPS_FEED_LIMIT`. */
export const DEFAULT_BILLING_RECOVERY_RECORD_LIMIT = 500;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** One recovered payment: a successful charge that settled one or more earlier failed attempts. */
export interface RecoveredPayment {
  /** The recovering `stripe_charge` raw record's id. */
  id: string;
  customerId: string;
  /** Upper-cased ISO currency code. */
  currency: string;
  /** The recovering charge's amount, in Stripe's minor unit for `currency` - never converted. */
  amountMinorUnits: number;
  recoveryChargeId: string | null;
  /** When the first failed attempt this charge settled happened (Stripe's own `created`, not landing time). */
  firstFailedAt: string;
  recoveredAt: string;
  /** How many failed attempts this one charge settled (Stripe retries each create their own failed charge). */
  failedAttempts: number;
  hoursToRecover: number;
  /** The most recent settled attempt's Stripe `failure_code`, when it carried one. */
  lastFailureCode: string | null;
}

/** Recovered amount per currency - amounts in different currencies are never added together. */
export interface RecoveredAmountByCurrency {
  currency: string;
  amountMinorUnits: number;
  payments: number;
}

export interface FailedAttemptOutcomes {
  /** Followed by a matching successful charge inside the window. */
  recovered: number;
  /** The window closed with no matching successful charge. */
  unrecovered: number;
  /** No match yet, but the window is still open - neither a recovery nor a loss yet. */
  pending: number;
  /** No customer, amount, currency or timestamp to match on - cannot be classified at all. */
  unpairable: number;
}

export interface BillingRecoverySummary {
  windowDays: number;
  /** Newest recovery first. */
  recoveries: RecoveredPayment[];
  /** Largest amount first within each currency's own unit (so the order is only meaningful per currency). */
  recoveredByCurrency: RecoveredAmountByCurrency[];
  failedAttempts: FailedAttemptOutcomes;
  /** `recovered / (recovered + unrecovered)` over attempts whose outcome is known; `null` when no attempt's outcome is known yet. */
  recoveryRate: number | null;
  /** `null` when nothing was recovered. */
  medianHoursToRecover: number | null;
  failedPaymentsScanned: number;
  chargesScanned: number;
  /** The scan hit its cap - older failed payments exist that were not read. */
  failedPaymentsTruncated: boolean;
  /** The scan hit its cap - older charges exist that were not read. */
  chargesTruncated: boolean;
}

export interface PairFailedPaymentRecoveriesOptions {
  now?: Date | string | number;
  windowDays?: number;
}

type RecordLike = Pick<RawRecordModel, 'id' | 'kind' | 'payload' | 'landed_at'>;

interface ParsedFailure {
  chargeId: string | null;
  customerId: string;
  currency: string;
  amountMinorUnits: number;
  failedAtMs: number;
  failedAt: string;
  failureCode: string | null;
}

interface ParsedCharge {
  recordId: string;
  chargeId: string | null;
  customerId: string;
  currency: string;
  amountMinorUnits: number;
  chargedAtMs: number;
  chargedAt: string;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The fact's own time - the envelope `ts` the mapper set from Stripe's `created` - so a backfill landed weeks later still pairs by when the payment actually happened. */
function occurredAt(record: RecordLike): { iso: string; ms: number } | null {
  const ts = nonEmptyString(record.payload.ts);
  if (ts === null) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : { iso: new Date(ms).toISOString(), ms };
}

function parseFailure(record: RecordLike): ParsedFailure | null {
  const properties = checkRecordEnvelope('event', record.payload).fieldsToValidate;
  const customerId = nonEmptyString(properties.customer_id);
  const currency = nonEmptyString(properties.currency);
  const amountMinorUnits = finiteNumber(properties.amount);
  const when = occurredAt(record);
  if (customerId === null || currency === null || amountMinorUnits === null || when === null) return null;
  return {
    chargeId: nonEmptyString(properties.charge_id),
    customerId,
    currency: currency.toUpperCase(),
    amountMinorUnits,
    failedAtMs: when.ms,
    failedAt: when.iso,
    failureCode: nonEmptyString(properties.failure_code),
  };
}

/** Only a charge that actually collected money can recover a payment: `succeeded` and not fully refunded. */
function parseSuccessfulCharge(record: RecordLike): ParsedCharge | null {
  const properties = checkRecordEnvelope('event', record.payload).fieldsToValidate;
  if (properties.status !== 'succeeded' || properties.refunded === true) return null;
  const customerId = nonEmptyString(properties.customer_id);
  const currency = nonEmptyString(properties.currency);
  const amountMinorUnits = finiteNumber(properties.amount);
  const when = occurredAt(record);
  if (customerId === null || currency === null || amountMinorUnits === null || amountMinorUnits <= 0 || when === null) return null;
  return {
    recordId: record.id,
    chargeId: nonEmptyString(properties.charge_id),
    customerId,
    currency: currency.toUpperCase(),
    amountMinorUnits,
    chargedAtMs: when.ms,
    chargedAt: when.iso,
  };
}

/** One record per Stripe charge id: the same charge can reach Firestore through both a webhook and a backfill. Records without a charge id are kept as-is. */
function dedupeByChargeId<T extends { chargeId: string | null }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (item.chargeId !== null) {
      if (seen.has(item.chargeId)) continue;
      seen.add(item.chargeId);
    }
    result.push(item);
  }
  return result;
}

function pairingKey(customerId: string, currency: string, amountMinorUnits: number): string {
  return `${customerId}\u0000${currency}\u0000${amountMinorUnits}`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Pairs landed `stripe_failed_payment` events with the successful `stripe_charge` that recovered them
 * (KAN-304). A failed attempt counts as recovered by the EARLIEST successful, not fully refunded charge
 * that is:
 *   - for the same customer, in the same currency, for the same amount (a Stripe retry - or the
 *     customer paying the open invoice with a new card - charges the invoice's same `amount_due`), and
 *   - strictly after the failure and no more than `windowDays` after it
 *     ({@link DEFAULT_PAYMENT_RECOVERY_WINDOW_DAYS}).
 *
 * Every Stripe retry is its own failed charge, so several failed attempts can share one recovering
 * charge; they collapse into a single {@link RecoveredPayment} with `failedAttempts` > 1, so the money
 * is counted once. Known limit of the window heuristic: a customer paying an unrelated same-amount
 * charge inside the window would be read as a recovery, because the landed records carry no invoice
 * link to rule it out.
 *
 * Pure - no Firestore access - so the pairing rules are unit-testable on their own.
 */
export function pairFailedPaymentRecoveries(
  failedPaymentRecords: readonly RecordLike[],
  chargeRecords: readonly RecordLike[],
  options: PairFailedPaymentRecoveriesOptions = {},
): Omit<BillingRecoverySummary, 'failedPaymentsTruncated' | 'chargesTruncated'> {
  const windowDays = options.windowDays ?? DEFAULT_PAYMENT_RECOVERY_WINDOW_DAYS;
  const windowMs = windowDays * DAY_MS;
  const nowMs = options.now === undefined ? Date.now() : new Date(options.now).getTime();

  const parsedFailures = failedPaymentRecords.map(parseFailure);
  const unpairable = parsedFailures.filter((failure) => failure === null).length;
  const failures = dedupeByChargeId(parsedFailures.filter((failure): failure is ParsedFailure => failure !== null)).sort(
    (a, b) => a.failedAtMs - b.failedAtMs,
  );

  const chargesByKey = new Map<string, ParsedCharge[]>();
  for (const charge of dedupeByChargeId(chargeRecords.map(parseSuccessfulCharge).filter((c): c is ParsedCharge => c !== null))) {
    const key = pairingKey(charge.customerId, charge.currency, charge.amountMinorUnits);
    chargesByKey.set(key, [...(chargesByKey.get(key) ?? []), charge]);
  }
  for (const list of chargesByKey.values()) {
    list.sort((a, b) => a.chargedAtMs - b.chargedAtMs);
  }

  const outcomes: FailedAttemptOutcomes = { recovered: 0, unrecovered: 0, pending: 0, unpairable };
  const settledByCharge = new Map<string, { charge: ParsedCharge; failures: ParsedFailure[] }>();

  for (const failure of failures) {
    const candidates = chargesByKey.get(pairingKey(failure.customerId, failure.currency, failure.amountMinorUnits)) ?? [];
    const recovery = candidates.find(
      (charge) => charge.chargedAtMs > failure.failedAtMs && charge.chargedAtMs - failure.failedAtMs <= windowMs,
    );
    if (recovery) {
      outcomes.recovered += 1;
      const entry = settledByCharge.get(recovery.recordId) ?? { charge: recovery, failures: [] };
      entry.failures.push(failure);
      settledByCharge.set(recovery.recordId, entry);
    } else if (nowMs - failure.failedAtMs < windowMs) {
      outcomes.pending += 1;
    } else {
      outcomes.unrecovered += 1;
    }
  }

  const recoveries: RecoveredPayment[] = [...settledByCharge.values()]
    .map(({ charge, failures: settled }) => {
      const first = settled[0];
      const last = settled[settled.length - 1];
      return {
        id: charge.recordId,
        customerId: charge.customerId,
        currency: charge.currency,
        amountMinorUnits: charge.amountMinorUnits,
        recoveryChargeId: charge.chargeId,
        firstFailedAt: first.failedAt,
        recoveredAt: charge.chargedAt,
        failedAttempts: settled.length,
        hoursToRecover: roundOneDecimal((charge.chargedAtMs - first.failedAtMs) / HOUR_MS),
        lastFailureCode: last.failureCode,
      };
    })
    .sort((a, b) => (a.recoveredAt < b.recoveredAt ? 1 : a.recoveredAt > b.recoveredAt ? -1 : 0));

  const byCurrency = new Map<string, RecoveredAmountByCurrency>();
  for (const recovery of recoveries) {
    const totals = byCurrency.get(recovery.currency) ?? { currency: recovery.currency, amountMinorUnits: 0, payments: 0 };
    totals.amountMinorUnits += recovery.amountMinorUnits;
    totals.payments += 1;
    byCurrency.set(recovery.currency, totals);
  }

  const known = outcomes.recovered + outcomes.unrecovered;
  return {
    windowDays,
    recoveries,
    recoveredByCurrency: [...byCurrency.values()].sort((a, b) => b.payments - a.payments || a.currency.localeCompare(b.currency)),
    failedAttempts: outcomes,
    recoveryRate: known === 0 ? null : outcomes.recovered / known,
    medianHoursToRecover: median(recoveries.map((recovery) => recovery.hoursToRecover)),
    failedPaymentsScanned: failedPaymentRecords.length,
    chargesScanned: chargeRecords.length,
  };
}

export interface GetBillingRecoveryForProjectOptions extends PairFailedPaymentRecoveriesOptions {
  limit?: number;
}

/**
 * The billing-ops page's "recovered payments" section (KAN-304): the project's most recent failed
 * payments and charges, read through the same `listRecentRecordsForSchemas` feed every other billing
 * section reads (so it is scoped to the same default environment), paired by
 * {@link pairFailedPaymentRecoveries}. Each read over-fetches one row so truncation is measured rather
 * than guessed - a capped scan is a window, and the page says so.
 */
export async function getBillingRecoveryForProject(
  organizationId: string,
  projectId: string,
  options: GetBillingRecoveryForProjectOptions = {},
): Promise<BillingRecoverySummary> {
  const limit = options.limit ?? DEFAULT_BILLING_RECOVERY_RECORD_LIMIT;
  const [failedPaymentRecords, chargeRecords] = await Promise.all([
    listRecentRecordsForSchemas({ organizationId, projectId, kind: 'event', schemaNames: [STRIPE_FAILED_PAYMENT_EVENT_NAME], limit: limit + 1 }),
    listRecentRecordsForSchemas({ organizationId, projectId, kind: 'event', schemaNames: [STRIPE_CHARGE_EVENT_NAME], limit: limit + 1 }),
  ]);
  const summary = pairFailedPaymentRecoveries(failedPaymentRecords.slice(0, limit), chargeRecords.slice(0, limit), options);
  return {
    ...summary,
    failedPaymentsTruncated: failedPaymentRecords.length > limit,
    chargesTruncated: chargeRecords.length > limit,
  };
}
