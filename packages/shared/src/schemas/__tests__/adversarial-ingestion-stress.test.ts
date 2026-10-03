import { describe, expect, it } from 'vitest';
import {
  validateCanonicalEvent,
  validateSubscriptionStateChange,
  validateCustomerTransaction,
  validateAdSpend,
  validateProductTelemetry,
  validateCrmLifecycle,
  subscriptionStateChangeFixtures,
  customerTransactionFixtures,
  adSpendFixtures,
  productTelemetryFixtures,
  crmLifecycleFixtures,
  METRIC_INGESTION_MAPPINGS,
  getMetricIngestionRequirement,
  getPrerequisitesForMetric,
  getMetricsImpactedByMissingStreams,
  type CanonicalEventType,
  type GrowthOsMetricKey,
} from '../index';

/**
 * Adversarial Stress Test Suite for GrowthOS Canonical Schemas, Validation Engine & Ingestion Pipeline
 *
 * Target Stress Areas:
 * 1. Extreme clock-skew payloads (10 years past/future, Leap seconds, epoch zero, custom skew)
 * 2. Negative ad spend quarantine and boundary zero values
 * 3. High-volume batch ingestion payloads (1,000 concurrent events)
 * 4. Malformed JSON, missing required fields, type coercions & currency handling
 * 5. Multi-stream dependency resolution and matrix completeness
 */

describe('Adversarial Stress: Canonical Schemas & Ingestion Validation Engine', () => {
  const referenceNow = '2026-09-02T12:00:00.000Z';

  // =========================================================================
  // 1. Extreme Clock-Skew Payloads
  // =========================================================================
  describe('1. Extreme Clock-Skew Payloads & Leap Second Stress', () => {
    const tenYearsFuture = '2036-09-02T12:00:00.000Z';
    const tenYearsPast = '2016-09-02T12:00:00.000Z';
    const epochZero = '1970-01-01T00:00:00.000Z';
    const epochZeroDateOnly = '1970-01-01';

    it('rejects 10-years-in-the-future payloads across all 5 canonical schemas with CLOCK_SKEW_FUTURE', () => {
      const subRes = validateSubscriptionStateChange(
        { ...subscriptionStateChangeFixtures.newSubscription, ts: tenYearsFuture },
        { now: referenceNow },
      );
      expect(subRes.valid).toBe(false);
      expect(subRes.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);
      expect(subRes.errors?.find((e) => e.code === 'CLOCK_SKEW_FUTURE')?.message).toContain('too far in the future');

      const txRes = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: tenYearsFuture },
        { now: referenceNow },
      );
      expect(txRes.valid).toBe(false);
      expect(txRes.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);

      const adRes = validateAdSpend(
        { ...adSpendFixtures.googleAdsSpend, ts: '2036-09-02' },
        { now: referenceNow },
      );
      expect(adRes.valid).toBe(false);
      expect(adRes.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);

      const telRes = validateProductTelemetry(
        { ...productTelemetryFixtures.pageView, ts: tenYearsFuture },
        { now: referenceNow },
      );
      expect(telRes.valid).toBe(false);
      expect(telRes.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);

      const crmRes = validateCrmLifecycle(
        { ...crmLifecycleFixtures.salesforceDemoHeld, ts: tenYearsFuture },
        { now: referenceNow },
      );
      expect(crmRes.valid).toBe(false);
      expect(crmRes.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);
    });

    it('rejects 10-years-in-the-past payloads across all 5 canonical schemas with CLOCK_SKEW_PAST', () => {
      const subRes = validateSubscriptionStateChange(
        { ...subscriptionStateChangeFixtures.newSubscription, ts: tenYearsPast },
        { now: referenceNow },
      );
      expect(subRes.valid).toBe(false);
      expect(subRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const txRes = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: tenYearsPast },
        { now: referenceNow },
      );
      expect(txRes.valid).toBe(false);
      expect(txRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const adRes = validateAdSpend(
        { ...adSpendFixtures.googleAdsSpend, ts: '2016-09-02' },
        { now: referenceNow },
      );
      expect(adRes.valid).toBe(false);
      expect(adRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const telRes = validateProductTelemetry(
        { ...productTelemetryFixtures.pageView, ts: tenYearsPast },
        { now: referenceNow },
      );
      expect(telRes.valid).toBe(false);
      expect(telRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const crmRes = validateCrmLifecycle(
        { ...crmLifecycleFixtures.salesforceDemoHeld, ts: tenYearsPast },
        { now: referenceNow },
      );
      expect(crmRes.valid).toBe(false);
      expect(crmRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);
    });

    it('rejects Epoch Zero (1970-01-01) timestamps across all 5 schemas as extreme past skew', () => {
      const subRes = validateSubscriptionStateChange(
        { ...subscriptionStateChangeFixtures.newSubscription, ts: epochZero },
        { now: referenceNow },
      );
      expect(subRes.valid).toBe(false);
      expect(subRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const txRes = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: epochZero },
        { now: referenceNow },
      );
      expect(txRes.valid).toBe(false);
      expect(txRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const adRes = validateAdSpend(
        { ...adSpendFixtures.googleAdsSpend, ts: epochZeroDateOnly },
        { now: referenceNow },
      );
      expect(adRes.valid).toBe(false);
      expect(adRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const telRes = validateProductTelemetry(
        { ...productTelemetryFixtures.pageView, ts: epochZero },
        { now: referenceNow },
      );
      expect(telRes.valid).toBe(false);
      expect(telRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);

      const crmRes = validateCrmLifecycle(
        { ...crmLifecycleFixtures.salesforceDemoHeld, ts: epochZero },
        { now: referenceNow },
      );
      expect(crmRes.valid).toBe(false);
      expect(crmRes.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);
    });

    it('handles Leap Second timestamps (e.g. 23:59:60) safely without crashing', () => {
      const leapSecondTs = '2016-12-31T23:59:60.000Z';
      const parsed = Date.parse(leapSecondTs);

      // In V8, :60 produces NaN or resolves to next second
      const res = validateSubscriptionStateChange(
        { ...subscriptionStateChangeFixtures.newSubscription, ts: leapSecondTs },
        { now: referenceNow },
      );

      if (Number.isNaN(parsed)) {
        expect(res.valid).toBe(false);
        expect(res.errors?.some((e) => e.code === 'INVALID_FORMAT')).toBe(true);
      } else {
        expect(res.valid).toBe(false);
        expect(res.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);
      }
    });

    it('evaluates millisecond-precise boundary conditions on maxFutureSkew and maxPastSkew', () => {
      const nowMs = new Date(referenceNow).getTime();
      const maxFutureSec = 3600; // 1 hour
      const maxPastSec = 7200; // 2 hours

      // Exactly at future boundary (now + 3600s)
      const exactFutureBoundary = new Date(nowMs + maxFutureSec * 1000).toISOString();
      const resExactFuture = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: exactFutureBoundary },
        { now: referenceNow, maxFutureSkewSeconds: maxFutureSec },
      );
      expect(resExactFuture.valid).toBe(true);

      // 1 millisecond past future boundary (now + 3600s + 1ms)
      const overFutureBoundary = new Date(nowMs + maxFutureSec * 1000 + 1).toISOString();
      const resOverFuture = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: overFutureBoundary },
        { now: referenceNow, maxFutureSkewSeconds: maxFutureSec },
      );
      expect(resOverFuture.valid).toBe(false);
      expect(resOverFuture.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);

      // Exactly at past boundary (now - 7200s)
      const exactPastBoundary = new Date(nowMs - maxPastSec * 1000).toISOString();
      const resExactPast = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: exactPastBoundary },
        { now: referenceNow, maxPastSkewSeconds: maxPastSec },
      );
      expect(resExactPast.valid).toBe(true);

      // 1 millisecond beyond past boundary (now - 7200s - 1ms)
      const overPastBoundary = new Date(nowMs - maxPastSec * 1000 - 1).toISOString();
      const resOverPast = validateCustomerTransaction(
        { ...customerTransactionFixtures.initialPurchase, ts: overPastBoundary },
        { now: referenceNow, maxPastSkewSeconds: maxPastSec },
      );
      expect(resOverPast.valid).toBe(false);
      expect(resOverPast.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);
    });
  });

  // =========================================================================
  // 2. Negative Ad Spend Quarantine & Boundary Zero Values
  // =========================================================================
  describe('2. Negative Ad Spend Quarantine & Boundary Zero Values', () => {
    it('quarantines all magnitudes of negative ad spend and reports quarantine diagnostics', () => {
      const negativeValues = [-0.0001, -0.01, -1.0, -100.5, -999999.99, -1e-6];

      for (const val of negativeValues) {
        const res = validateAdSpend(
          { ...adSpendFixtures.googleAdsSpend, value: val, ts: '2026-09-02' },
          { now: referenceNow },
        );

        expect(res.valid).toBe(false);
        expect(res.quarantined).toBe(true);
        expect(res.quarantineReason).toContain(String(val));
        expect(res.errors?.some((e) => e.code === 'NEGATIVE_SPEND')).toBe(true);
      }
    });

    it('admits zero and micro-positive boundary spend values cleanly without quarantine', () => {
      // 0 spend (e.g. paused campaign, organic reach, 0 budget day)
      const resZero = validateAdSpend(
        { ...adSpendFixtures.googleAdsSpend, value: 0, ts: '2026-09-02' },
        { now: referenceNow },
      );
      expect(resZero.valid).toBe(true);
      expect(resZero.quarantined).toBeUndefined();
      expect(resZero.data?.value).toBe(0);

      // Micro positive spend
      const resMicro = validateAdSpend(
        { ...adSpendFixtures.googleAdsSpend, value: 0.0001, ts: '2026-09-02' },
        { now: referenceNow },
      );
      expect(resMicro.valid).toBe(true);
      expect(resMicro.data?.value).toBe(0.0001);
    });

    it('rejects invalid non-numeric and NaN ad spend values', () => {
      const invalidValues = [NaN, '100.50', null, undefined, {}];

      for (const val of invalidValues) {
        const res = validateAdSpend(
          { ...adSpendFixtures.googleAdsSpend, value: val, ts: '2026-09-02' },
          { now: referenceNow },
        );
        expect(res.valid).toBe(false);
        expect(res.errors?.some((e) => e.code === 'INVALID_TYPE' || e.code === 'REQUIRED_FIELD')).toBe(true);
      }
    });

    it('validates boundary zeros and negative integer constraints across all schemas', () => {
      // Customer transaction: amountCents = 0 is valid ($0 free trial authorization)
      const resTxZero = validateCustomerTransaction(
        {
          ...customerTransactionFixtures.initialPurchase,
          ts: referenceNow,
          properties: { ...customerTransactionFixtures.initialPurchase.properties, amountCents: 0 },
        },
        { now: referenceNow },
      );
      expect(resTxZero.valid).toBe(true);

      // Customer transaction: amountCents = -1 is INVALID (negative amount)
      const resTxNeg = validateCustomerTransaction(
        {
          ...customerTransactionFixtures.initialPurchase,
          ts: referenceNow,
          properties: { ...customerTransactionFixtures.initialPurchase.properties, amountCents: -1 },
        },
        { now: referenceNow },
      );
      expect(resTxNeg.valid).toBe(false);
      expect(resTxNeg.errors?.some((e) => e.code === 'OUT_OF_RANGE')).toBe(true);

      // Subscription: currentMrrCents = 0 is valid (churned or $0 tier), currentMrrCents = -100 is INVALID
      const resSubNeg = validateSubscriptionStateChange(
        {
          ...subscriptionStateChangeFixtures.newSubscription,
          ts: referenceNow,
          properties: { ...subscriptionStateChangeFixtures.newSubscription.properties, currentMrrCents: -100 },
        },
        { now: referenceNow },
      );
      expect(resSubNeg.valid).toBe(false);
      expect(resSubNeg.errors?.some((e) => e.code === 'OUT_OF_RANGE')).toBe(true);

      // Subscription: mrrDeltaCents = -5000 is VALID (churn / downgrade decreases MRR)
      const resSubDeltaNeg = validateSubscriptionStateChange(
        {
          ...subscriptionStateChangeFixtures.cancellation,
          ts: referenceNow,
          properties: { ...subscriptionStateChangeFixtures.cancellation.properties, mrrDeltaCents: -5000, currentMrrCents: 0 },
        },
        { now: referenceNow },
      );
      expect(resSubDeltaNeg.valid).toBe(true);

      // CRM: dealValueCents = 0 is valid, dealValueCents = -500 is INVALID
      const resCrmNeg = validateCrmLifecycle(
        {
          ...crmLifecycleFixtures.salesforceDemoHeld,
          ts: referenceNow,
          properties: { ...crmLifecycleFixtures.salesforceDemoHeld.properties, dealValueCents: -500 },
        },
        { now: referenceNow },
      );
      expect(resCrmNeg.valid).toBe(false);
      expect(resCrmNeg.errors?.some((e) => e.code === 'OUT_OF_RANGE')).toBe(true);
    });
  });

  // =========================================================================
  // 3. High-Volume Batch Ingestion (1,000 Concurrent Events)
  // =========================================================================
  describe('3. High-Volume Batch Ingestion Payloads (1,000 Concurrent Events)', () => {
    it('validates 1,000 heterogeneous concurrent events in < 200ms with 100% fidelity', () => {
      const batchSize = 1000;
      const events: Array<{ type: CanonicalEventType; payload: unknown }> = [];

      for (let i = 0; i < batchSize; i++) {
        const mod = i % 5;
        const ts = new Date(Date.now() - (i % 86400) * 1000).toISOString();

        if (mod === 0) {
          events.push({
            type: 'subscription_state_change',
            payload: {
              ...subscriptionStateChangeFixtures.newSubscription,
              eventId: `evt_sub_${i}`,
              ts,
              customerId: `cust_${i}`,
              properties: {
                ...subscriptionStateChangeFixtures.newSubscription.properties,
                subscriptionId: `sub_${i}`,
                mrrDeltaCents: 1000 + (i * 10),
                currentMrrCents: 1000 + (i * 10),
              },
            },
          });
        } else if (mod === 1) {
          events.push({
            type: 'customer_transaction',
            payload: {
              ...customerTransactionFixtures.initialPurchase,
              eventId: `evt_tx_${i}`,
              ts,
              customerId: `cust_${i}`,
              properties: {
                ...customerTransactionFixtures.initialPurchase.properties,
                transactionId: `tx_${i}`,
                amountCents: 5000 + (i * 5),
              },
            },
          });
        } else if (mod === 2) {
          events.push({
            type: 'ad_spend',
            payload: {
              ...adSpendFixtures.googleAdsSpend,
              ts: ts.slice(0, 10),
              value: 50.0 + (i * 0.1),
              dimensions: {
                ...adSpendFixtures.googleAdsSpend.dimensions,
                campaignId: `cmp_${i}`,
              },
            },
          });
        } else if (mod === 3) {
          events.push({
            type: 'product_telemetry',
            payload: {
              ...productTelemetryFixtures.pageView,
              eventId: `evt_tel_${i}`,
              ts,
              anonId: `anon_${i}`,
              customerId: `cust_${i}`,
              properties: {
                ...productTelemetryFixtures.pageView.properties,
                sessionId: `sess_${i}`,
              },
            },
          });
        } else {
          events.push({
            type: 'crm_lifecycle',
            payload: {
              ...crmLifecycleFixtures.salesforceDemoHeld,
              eventId: `evt_crm_${i}`,
              ts,
              customerId: `cust_${i}`,
              properties: {
                ...crmLifecycleFixtures.salesforceDemoHeld.properties,
                dealId: `deal_${i}`,
              },
            },
          });
        }
      }

      expect(events).toHaveLength(1000);

      const startTime = performance.now();
      const results = events.map((item) => validateCanonicalEvent(item.type, item.payload));
      const durationMs = performance.now() - startTime;

      // Ensure execution performance is sub-200ms for 1,000 events
      expect(durationMs).toBeLessThan(200);

      // Verify all 1,000 events were valid
      const validCount = results.filter((r) => r.valid).length;
      expect(validCount).toBe(1000);
    });

    it('correctly segregates an adversarial mixed batch of 800 valid and 200 corrupted events', () => {
      const mixedBatch: Array<{ id: string; type: CanonicalEventType; payload: unknown; shouldPass: boolean }> = [];

      for (let i = 0; i < 1000; i++) {
        const isCorrupt = i % 5 === 0; // 200 corrupted, 800 valid

        if (isCorrupt) {
          // Injects various adversarial corruptions
          const corruptionType = i % 4;
          if (corruptionType === 0) {
            // Negative spend
            mixedBatch.push({
              id: `corrupt_${i}`,
              type: 'ad_spend',
              payload: { ...adSpendFixtures.googleAdsSpend, value: -100, ts: '2026-09-02' },
              shouldPass: false,
            });
          } else if (corruptionType === 1) {
            // Future clock skew
            mixedBatch.push({
              id: `corrupt_${i}`,
              type: 'customer_transaction',
              payload: { ...customerTransactionFixtures.initialPurchase, ts: '2036-09-02T00:00:00Z' },
              shouldPass: false,
            });
          } else if (corruptionType === 2) {
            // Missing customerId
            mixedBatch.push({
              id: `corrupt_${i}`,
              type: 'subscription_state_change',
              payload: { ...subscriptionStateChangeFixtures.newSubscription, customerId: '' },
              shouldPass: false,
            });
          } else {
            // Float instead of integer cents
            mixedBatch.push({
              id: `corrupt_${i}`,
              type: 'customer_transaction',
              payload: {
                ...customerTransactionFixtures.initialPurchase,
                properties: { ...customerTransactionFixtures.initialPurchase.properties, amountCents: 99.99 },
              },
              shouldPass: false,
            });
          }
        } else {
          // Valid event
          mixedBatch.push({
            id: `valid_${i}`,
            type: 'product_telemetry',
            payload: {
              ...productTelemetryFixtures.pageView,
              eventId: `evt_v_${i}`,
              anonId: `anon_${i}`,
              properties: { ...productTelemetryFixtures.pageView.properties, sessionId: `sess_${i}` },
            },
            shouldPass: true,
          });
        }
      }

      let acceptedCount = 0;
      let quarantinedCount = 0;

      mixedBatch.forEach((item) => {
        const res = validateCanonicalEvent(item.type, item.payload);
        if (res.valid) {
          acceptedCount++;
          expect(item.shouldPass).toBe(true);
        } else {
          quarantinedCount++;
          expect(item.shouldPass).toBe(false);
        }
      });

      expect(acceptedCount).toBe(800);
      expect(quarantinedCount).toBe(200);
    });
  });

  // =========================================================================
  // 4. Malformed JSON, Missing Fields & Type Coercion Resistance
  // =========================================================================
  describe('4. Malformed JSON, Missing Fields & Type Coercion Resistance', () => {
    it('rejects primitives, null, undefined, and arrays gracefully', () => {
      const badPayloads = [null, undefined, '', 12345, true, false, [], [1, 2, 3], () => {}];

      for (const payload of badPayloads) {
        const res = validateCanonicalEvent('subscription_state_change', payload);
        expect(res.valid).toBe(false);
        expect(res.errors?.[0]?.code).toBe('INVALID_PAYLOAD');
      }
    });

    it('rejects unknown canonical event type strings with UNKNOWN_EVENT_TYPE', () => {
      const res = validateCanonicalEvent('unregistered_custom_event', { foo: 'bar' });
      expect(res.valid).toBe(false);
      expect(res.errors?.[0]?.code).toBe('UNKNOWN_EVENT_TYPE');
      expect(res.errors?.[0]?.message).toContain('unregistered_custom_event');
    });

    it('reports missing required top-level and nested fields on empty object', () => {
      const res = validateSubscriptionStateChange({});
      expect(res.valid).toBe(false);
      const errorPaths = res.errors?.map((e) => e.path);

      expect(errorPaths).toContain('event');
      expect(errorPaths).toContain('eventId');
      expect(errorPaths).toContain('ts');
      expect(errorPaths).toContain('customerId');
      expect(errorPaths).toContain('properties');
    });

    it('strictly resists type coercion on numeric minor unit fields', () => {
      // String integer string should NOT be coerced to number
      const resStringCents = validateCustomerTransaction({
        ...customerTransactionFixtures.initialPurchase,
        ts: referenceNow,
        properties: {
          ...customerTransactionFixtures.initialPurchase.properties,
          amountCents: '5000' as unknown as number,
        },
      });
      expect(resStringCents.valid).toBe(false);
      expect(resStringCents.errors?.some((e) => e.code === 'OUT_OF_RANGE' || e.code === 'INVALID_TYPE')).toBe(true);

      // Decimal cents (e.g. 49.99 instead of 4999) must be rejected
      const resFloatCents = validateCustomerTransaction({
        ...customerTransactionFixtures.initialPurchase,
        ts: referenceNow,
        properties: {
          ...customerTransactionFixtures.initialPurchase.properties,
          amountCents: 49.99,
        },
      });
      expect(resFloatCents.valid).toBe(false);
      expect(resFloatCents.errors?.some((e) => e.code === 'OUT_OF_RANGE' || e.code === 'INVALID_TYPE')).toBe(true);
    });

    it('strictly validates ISO-4217 currency format and normalizes lowercase 3-letter codes', () => {
      // Valid uppercase 3-letter codes
      const resUSD = validateCustomerTransaction({
        ...customerTransactionFixtures.initialPurchase,
        ts: referenceNow,
        properties: { ...customerTransactionFixtures.initialPurchase.properties, currency: 'USD' },
      });
      expect(resUSD.valid).toBe(true);
      expect(resUSD.data?.properties.currency).toBe('USD');

      // Lowercase 3-letter code is normalized to uppercase
      const resLowerUsd = validateCustomerTransaction({
        ...customerTransactionFixtures.initialPurchase,
        ts: referenceNow,
        properties: { ...customerTransactionFixtures.initialPurchase.properties, currency: 'usd' },
      });
      expect(resLowerUsd.valid).toBe(true);
      expect(resLowerUsd.data?.properties.currency).toBe('USD');

      // Invalid currency codes (non-3 letters, numbers, symbols)
      const badCurrencies = ['US', 'USDT', '123', '$$$', 'US Dollar', ''];
      for (const cur of badCurrencies) {
        const res = validateCustomerTransaction({
          ...customerTransactionFixtures.initialPurchase,
          ts: referenceNow,
          properties: {
            ...customerTransactionFixtures.initialPurchase.properties,
            currency: cur,
          },
        });
        expect(res.valid).toBe(false);
        expect(res.errors?.some((e) => e.code === 'INVALID_FORMAT' || e.code === 'REQUIRED_FIELD')).toBe(true);
      }
    });

    it('strictly enforces business logic invariants across cross-dependent fields', () => {
      // Invariant 1: refundedAmountCents cannot exceed total amountCents
      const resOverRefund = validateCustomerTransaction({
        ...customerTransactionFixtures.initialPurchase,
        ts: referenceNow,
        properties: {
          ...customerTransactionFixtures.initialPurchase.properties,
          amountCents: 10000,
          refundedAmountCents: 15000,
        },
      });
      expect(resOverRefund.valid).toBe(false);
      expect(resOverRefund.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
      expect(resOverRefund.errors?.find((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')?.message).toContain('cannot exceed total amountCents');

      // Invariant 2: failed transaction requires failureCode or failureMessage
      const resFailedWithoutCode = validateCustomerTransaction({
        ...customerTransactionFixtures.initialPurchase,
        ts: referenceNow,
        properties: {
          ...customerTransactionFixtures.initialPurchase.properties,
          status: 'failed',
          failureCode: undefined,
          failureMessage: undefined,
        },
      });
      expect(resFailedWithoutCode.valid).toBe(false);
      expect(resFailedWithoutCode.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);

      // Invariant 3: cancellation changeType requires canceled currentStatus
      const resCancelActive = validateSubscriptionStateChange({
        ...subscriptionStateChangeFixtures.cancellation,
        ts: referenceNow,
        properties: {
          ...subscriptionStateChangeFixtures.cancellation.properties,
          changeType: 'cancellation',
          currentStatus: 'active',
        },
      });
      expect(resCancelActive.valid).toBe(false);
      expect(resCancelActive.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);

      // Invariant 4: new subscription changeType should not have previousStatus
      const resNewWithPrev = validateSubscriptionStateChange({
        ...subscriptionStateChangeFixtures.newSubscription,
        ts: referenceNow,
        properties: {
          ...subscriptionStateChangeFixtures.newSubscription.properties,
          changeType: 'new',
          previousStatus: 'active',
        },
      });
      expect(resNewWithPrev.valid).toBe(false);
      expect(resNewWithPrev.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);

      // Invariant 5: identify telemetry event requires customerId
      const resIdentifyNoCust = validateProductTelemetry({
        ...productTelemetryFixtures.pageView,
        ts: referenceNow,
        event: 'identify',
        customerId: undefined,
      });
      expect(resIdentifyNoCust.valid).toBe(false);
      expect(resIdentifyNoCust.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
    });
  });

  // =========================================================================
  // 5. Multi-Stream Ingestion Matrix & Impact Resolution
  // =========================================================================
  describe('5. Multi-Stream Dependency Resolution & Ingestion Matrix', () => {
    it('verifies all 15 GrowthOS metrics exist with non-empty prerequisite definitions', () => {
      const allKeys = Object.keys(METRIC_INGESTION_MAPPINGS) as GrowthOsMetricKey[];
      expect(allKeys.length).toBe(15);

      for (const key of allKeys) {
        const req = getMetricIngestionRequirement(key);
        expect(req).toBeDefined();
        expect(req?.requiredEventTypes.length).toBeGreaterThan(0);
        expect(req?.supportedConnectors.length).toBeGreaterThan(0);
        expect(req?.missingImpactDescription).toBeTruthy();
        expect(req?.recommendedQuickAction).toBeDefined();
      }
    });

    it('correctly maps missing stream impact when only a subset of event streams are active', () => {
      // If ad_spend is missing:
      const impactedByAdSpend = getMetricsImpactedByMissingStreams(['ad_spend']);
      const impactedKeys = impactedByAdSpend.map((m) => m.metricKey);

      expect(impactedKeys).toContain('ROI');
      expect(impactedKeys).toContain('BREAKEVEN');
      expect(impactedKeys).toContain('TROI');
      expect(impactedKeys).toContain('CAC');
      expect(impactedKeys).toContain('CAS');

      // But MRR and DAU_MAU are NOT impacted by missing ad_spend
      expect(impactedKeys).not.toContain('MRR');
      expect(impactedKeys).not.toContain('DAU_MAU');
      expect(impactedKeys).not.toContain('DEMOS_PIPELINE');
    });

    it('resolves exact prerequisites for multi-stream metrics (TROI, BREAKEVEN, CAC)', () => {
      expect(getPrerequisitesForMetric('TROI')).toEqual([
        'product_telemetry',
        'ad_spend',
        'customer_transaction',
      ]);
      expect(getPrerequisitesForMetric('BREAKEVEN')).toEqual([
        'ad_spend',
        'customer_transaction',
        'product_telemetry',
      ]);
      expect(getPrerequisitesForMetric('CAC')).toEqual([
        'ad_spend',
        'customer_transaction',
      ]);
      expect(getPrerequisitesForMetric('MRR')).toEqual([
        'subscription_state_change',
      ]);
    });
  });
});
