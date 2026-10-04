import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import { ProjectNotFoundError } from './resource-library.service';
import { checkRecordEnvelope } from './ingest.service';
import { listRecentRecordsForSchemas, listRecentDunningSubscriptionsForProject } from './pipeline.service';
import { STRIPE_CHARGE_EVENT_NAME, STRIPE_FAILED_PAYMENT_EVENT_NAME } from '../plugin-runtime/stripe/schemas';

export interface BillingRecoveryItem {
  id: string;
  customerId: string;
  recoveredAmount: number;
  recoveredAmountMinorUnits: number;
  currency: string;
  failedAt: string;
  recoveredAt: string;
  latencyHours: number;
  failureChargeId: string | null;
  recoveryChargeId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface ActiveDunningSummaryItem {
  id: string;
  customerId: string;
  mrrNormalized: number;
  currency: string;
  status: 'past_due' | 'unpaid';
  startedAt: string | null;
  landedAt: string;
  planInterval: string | null;
}

export interface BillingRecoveryAnalyticsResult {
  hasData: boolean;
  recoveredRevenueTotal: number;
  rolling30dRecovered: number;
  rolling90dRecovered: number;
  atRiskMrrTotal: number;
  activeDunningCount: number;
  recoveryRatePct: number;
  failedPaymentsCount: number;
  recoveredPaymentsCount: number;
  avgRecoveryHours: number;
  recentRecoveries: BillingRecoveryItem[];
  activeDunning: ActiveDunningSummaryItem[];
}

export interface BillingRecoveryOptions {
  now?: Date | string;
  candidateLimit?: number;
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

function stripeMinorUnitsToDecimal(amountMinorUnits: number): number {
  return amountMinorUnits / 100;
}

interface RawFailureData {
  id: string;
  customerId: string;
  chargeId: string | null;
  amountMinorUnits: number;
  currency: string;
  failedAt: string;
  failureCode: string | null;
  failureMessage: string | null;
}

interface RawChargeData {
  id: string;
  customerId: string;
  chargeId: string | null;
  amountMinorUnits: number;
  currency: string;
  chargedAt: string;
  status: string;
  isRefunded: boolean;
}

/**
 * Pure aggregation function that converts raw event and entity records into recovery telemetry.
 * Safe to test and execute without database connections.
 */
export function aggregateBillingRecoveryAnalytics(
  failedPaymentRecords: readonly RawRecordModel[],
  chargeRecords: readonly RawRecordModel[],
  dunningRecords: readonly RawRecordModel[],
  options?: BillingRecoveryOptions,
): BillingRecoveryAnalyticsResult {
  const now = options?.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  const MS_30D = 30 * 24 * 60 * 60 * 1000;
  const MS_90D = 90 * 24 * 60 * 60 * 1000;

  // 1. Parse failed payments
  const failures: RawFailureData[] = [];
  for (const record of failedPaymentRecords) {
    const { fieldsToValidate: properties } = checkRecordEnvelope('event', record.payload);
    const customerId = typeof properties.customer_id === 'string' ? properties.customer_id : '';
    if (!customerId) continue;

    const amount = typeof properties.amount === 'number' ? properties.amount : Number(properties.amount ?? 0);
    const currency = typeof properties.currency === 'string' ? properties.currency : 'usd';
    const envelopeTs = record.payload.ts;
    const failedAt = typeof envelopeTs === 'string' && envelopeTs.trim().length > 0 ? envelopeTs : record.landed_at;
    const chargeId = typeof properties.charge_id === 'string' ? properties.charge_id : null;
    const failureCode = typeof properties.failure_code === 'string' ? properties.failure_code : null;
    const failureMessage = typeof properties.failure_message === 'string' ? properties.failure_message : null;

    failures.push({
      id: record.id,
      customerId,
      chargeId,
      amountMinorUnits: Number.isFinite(amount) ? amount : 0,
      currency,
      failedAt,
      failureCode,
      failureMessage,
    });
  }

  // 2. Parse successful charges
  const charges: RawChargeData[] = [];
  for (const record of chargeRecords) {
    const { fieldsToValidate: properties } = checkRecordEnvelope('event', record.payload);
    const customerId = typeof properties.customer_id === 'string' ? properties.customer_id : '';
    if (!customerId) continue;

    const status = typeof properties.status === 'string' ? properties.status : '';
    const amountRefunded = typeof properties.amount_refunded === 'number' ? properties.amount_refunded : Number(properties.amount_refunded ?? 0);
    const isRefunded = properties.refunded === true || (Number.isFinite(amountRefunded) && amountRefunded > 0);
    if (status !== 'succeeded' || isRefunded) continue;

    const amount = typeof properties.amount === 'number' ? properties.amount : Number(properties.amount ?? 0);
    const currency = typeof properties.currency === 'string' ? properties.currency : 'usd';
    const envelopeTs = record.payload.ts;
    const chargedAt = typeof envelopeTs === 'string' && envelopeTs.trim().length > 0 ? envelopeTs : record.landed_at;
    const chargeId = typeof properties.charge_id === 'string' ? properties.charge_id : null;

    charges.push({
      id: record.id,
      customerId,
      chargeId,
      amountMinorUnits: Number.isFinite(amount) ? amount : 0,
      currency,
      chargedAt,
      status,
      isRefunded,
    });
  }

  // 3. Match failed payments with subsequent successful charges per customer
  const failuresByCustomer = new Map<string, RawFailureData[]>();
  for (const failure of failures) {
    const list = failuresByCustomer.get(failure.customerId) ?? [];
    list.push(failure);
    failuresByCustomer.set(failure.customerId, list);
  }

  const chargesByCustomer = new Map<string, RawChargeData[]>();
  for (const charge of charges) {
    const list = chargesByCustomer.get(charge.customerId) ?? [];
    list.push(charge);
    chargesByCustomer.set(charge.customerId, list);
  }

  const matchedChargeRecordIds = new Set<string>();
  const recentRecoveries: BillingRecoveryItem[] = [];

  for (const [customerId, customerFailures] of failuresByCustomer.entries()) {
    // Sort chronological: oldest failure first
    customerFailures.sort((a, b) => (a.failedAt < b.failedAt ? -1 : a.failedAt > b.failedAt ? 1 : 0));

    const customerCharges = chargesByCustomer.get(customerId) ?? [];
    // Sort chronological: oldest charge first
    customerCharges.sort((a, b) => (a.chargedAt < b.chargedAt ? -1 : a.chargedAt > b.chargedAt ? 1 : 0));

    for (const failure of customerFailures) {
      const failureMs = Date.parse(failure.failedAt);

      // Find the first successful charge that occurred AT OR AFTER the failure timestamp
      const recoveryCharge = customerCharges.find(
        (charge) => !matchedChargeRecordIds.has(charge.id) && Date.parse(charge.chargedAt) >= failureMs,
      );

      if (recoveryCharge) {
        matchedChargeRecordIds.add(recoveryCharge.id);
        const recoveryMs = Date.parse(recoveryCharge.chargedAt);
        const latencyMs = Math.max(0, recoveryMs - failureMs);
        const latencyHours = Number((latencyMs / (1000 * 60 * 60)).toFixed(1));
        const recoveredAmountMinor = recoveryCharge.amountMinorUnits > 0 ? recoveryCharge.amountMinorUnits : failure.amountMinorUnits;
        const recoveredAmount = stripeMinorUnitsToDecimal(recoveredAmountMinor);

        recentRecoveries.push({
          id: `rec_${failure.id}_${recoveryCharge.id}`,
          customerId,
          recoveredAmount: Number(recoveredAmount.toFixed(2)),
          recoveredAmountMinorUnits: recoveredAmountMinor,
          currency: recoveryCharge.currency || failure.currency,
          failedAt: failure.failedAt,
          recoveredAt: recoveryCharge.chargedAt,
          latencyHours,
          failureChargeId: failure.chargeId,
          recoveryChargeId: recoveryCharge.chargeId,
          failureCode: failure.failureCode,
          failureMessage: failure.failureMessage,
        });
      }
    }
  }

  // Sort recoveries newest first
  recentRecoveries.sort((a, b) => (a.recoveredAt < b.recoveredAt ? 1 : a.recoveredAt > b.recoveredAt ? -1 : 0));

  // 4. Parse dunning records
  const activeDunning: ActiveDunningSummaryItem[] = [];
  for (const record of dunningRecords) {
    const { fieldsToValidate: attributes } = checkRecordEnvelope('entity', record.payload);
    const customerId = typeof attributes.customer_id === 'string' ? attributes.customer_id : '';
    const mrrNormalized = typeof attributes.mrr_normalized === 'number' ? attributes.mrr_normalized : Number(attributes.mrr_normalized ?? 0);
    const currency = typeof attributes.currency === 'string' ? attributes.currency : 'usd';
    const status = attributes.status === 'unpaid' ? 'unpaid' : 'past_due';
    const startedAt = typeof attributes.started_at === 'string' ? attributes.started_at : null;
    const planInterval = typeof attributes.plan_interval === 'string' ? attributes.plan_interval : null;

    activeDunning.push({
      id: record.id,
      customerId,
      mrrNormalized: Number.isFinite(mrrNormalized) ? Number(mrrNormalized.toFixed(2)) : 0,
      currency,
      status,
      startedAt,
      landedAt: record.landed_at,
      planInterval,
    });
  }

  // 5. Aggregate metrics
  let recoveredRevenueTotal = 0;
  let rolling30dRecovered = 0;
  let rolling90dRecovered = 0;
  let totalLatencyHours = 0;

  for (const recovery of recentRecoveries) {
    recoveredRevenueTotal += recovery.recoveredAmount;
    totalLatencyHours += recovery.latencyHours;
    const recMs = Date.parse(recovery.recoveredAt);
    if (nowMs - recMs <= MS_30D) {
      rolling30dRecovered += recovery.recoveredAmount;
    }
    if (nowMs - recMs <= MS_90D) {
      rolling90dRecovered += recovery.recoveredAmount;
    }
  }

  const atRiskMrrTotal = Number(activeDunning.reduce((acc, d) => acc + d.mrrNormalized, 0).toFixed(2));
  const failedPaymentsCount = failures.length;
  const recoveredPaymentsCount = recentRecoveries.length;
  const recoveryRatePct =
    failedPaymentsCount > 0 ? Number(((recoveredPaymentsCount / failedPaymentsCount) * 100).toFixed(1)) : 0;
  const avgRecoveryHours =
    recoveredPaymentsCount > 0 ? Number((totalLatencyHours / recoveredPaymentsCount).toFixed(1)) : 0;

  const hasData = failedPaymentsCount > 0 || chargeRecords.length > 0 || dunningRecords.length > 0;

  return {
    hasData,
    recoveredRevenueTotal: Number(recoveredRevenueTotal.toFixed(2)),
    rolling30dRecovered: Number(rolling30dRecovered.toFixed(2)),
    rolling90dRecovered: Number(rolling90dRecovered.toFixed(2)),
    atRiskMrrTotal,
    activeDunningCount: activeDunning.length,
    recoveryRatePct,
    failedPaymentsCount,
    recoveredPaymentsCount,
    avgRecoveryHours,
    recentRecoveries,
    activeDunning,
  };
}

/**
 * Aggregates Stripe billing webhook events and dunning subscriptions into authentic recovery
 * revenue telemetry and involuntary churn prevention analytics (KAN-304, Stitch e9857ed6).
 *
 * Scans landed `RawRecordModel`s for `stripe_failed_payment` events and pairs them with subsequent
 * successful `stripe_charge` events for the same customer account. Computes rolling 30d/90d
 * recovered MRR, recovery payback latency (average hours from failure to recovery), recovery success
 * rate, and active dunning capital at risk.
 */
export async function getBillingRecoveryAnalyticsForProject(
  organizationId: string,
  projectId: string,
  options?: BillingRecoveryOptions,
): Promise<BillingRecoveryAnalyticsResult> {
  await requireProjectInOrg(organizationId, projectId);

  const limit = options?.candidateLimit ?? 200;

  const [failedPaymentRecords, chargeRecords, dunningRecords] = await Promise.all([
    listRecentRecordsForSchemas({
      organizationId,
      projectId,
      kind: 'event',
      schemaNames: [STRIPE_FAILED_PAYMENT_EVENT_NAME],
      limit,
    }),
    listRecentRecordsForSchemas({
      organizationId,
      projectId,
      kind: 'event',
      schemaNames: [STRIPE_CHARGE_EVENT_NAME],
      limit,
    }),
    listRecentDunningSubscriptionsForProject(organizationId, projectId, limit),
  ]);

  return aggregateBillingRecoveryAnalytics(failedPaymentRecords, chargeRecords, dunningRecords, options);
}
