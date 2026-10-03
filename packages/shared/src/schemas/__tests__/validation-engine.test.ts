import { describe, expect, it } from 'vitest';
import { validateCanonicalEvent } from '../validator';
import { subscriptionStateChangeFixtures } from '../fixtures/subscription-state-change.fixtures';
import { customerTransactionFixtures } from '../fixtures/customer-transaction.fixtures';
import { adSpendFixtures } from '../fixtures/ad-spend.fixtures';
import { productTelemetryFixtures } from '../fixtures/product-telemetry.fixtures';
import { crmLifecycleFixtures } from '../fixtures/crm-lifecycle.fixtures';

describe('Validation Engine - validateCanonicalEvent dispatcher', () => {
  const testNow = '2026-09-02T18:00:00.000Z';

  it('correctly routes and validates subscription_state_change events', () => {
    const res = validateCanonicalEvent(
      'subscription_state_change',
      subscriptionStateChangeFixtures.newSubscription,
      { now: testNow }
    );
    expect(res.valid).toBe(true);
    expect(res.data?.event).toBe('subscription_state_change');
  });

  it('correctly routes and validates customer_transaction events', () => {
    const res = validateCanonicalEvent(
      'customer_transaction',
      customerTransactionFixtures.initialPurchase,
      { now: testNow }
    );
    expect(res.valid).toBe(true);
    expect(res.data?.event).toBe('customer_transaction');
  });

  it('correctly routes and validates ad_spend measures', () => {
    const res = validateCanonicalEvent(
      'ad_spend',
      adSpendFixtures.googleAdsSpend,
      { now: testNow }
    );
    expect(res.valid).toBe(true);
    expect(res.data?.measure).toBe('ad_spend');
  });

  it('correctly routes and validates product_telemetry events', () => {
    const res = validateCanonicalEvent(
      'product_telemetry',
      productTelemetryFixtures.sessionStart,
      { now: testNow }
    );
    expect(res.valid).toBe(true);
    expect(res.data?.event).toBe('session_start');
  });

  it('correctly routes and validates crm_lifecycle events', () => {
    const res = validateCanonicalEvent(
      'crm_lifecycle',
      crmLifecycleFixtures.hubspotMqlToSql,
      { now: testNow }
    );
    expect(res.valid).toBe(true);
    expect(res.data?.event).toBe('crm_lifecycle');
  });

  it('returns UNKNOWN_EVENT_TYPE error for unrecognized event types', () => {
    const res = validateCanonicalEvent('unknown_custom_event', { foo: 'bar' });
    expect(res.valid).toBe(false);
    expect(res.errors?.[0].code).toBe('UNKNOWN_EVENT_TYPE');
    expect(res.errors?.[0].message).toContain('Unknown canonical event type');
  });

  it('handles null and undefined payloads cleanly across all routes', () => {
    const types = [
      'subscription_state_change',
      'customer_transaction',
      'ad_spend',
      'product_telemetry',
      'crm_lifecycle',
    ] as const;

    for (const t of types) {
      const resNull = validateCanonicalEvent(t, null);
      expect(resNull.valid).toBe(false);
      expect(resNull.errors?.[0].code).toBe('INVALID_PAYLOAD');

      const resUndef = validateCanonicalEvent(t, undefined);
      expect(resUndef.valid).toBe(false);
      expect(resUndef.errors?.[0].code).toBe('INVALID_PAYLOAD');
    }
  });
});
