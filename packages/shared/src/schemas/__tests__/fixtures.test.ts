import { describe, expect, it } from 'vitest';
import { validateCanonicalEvent } from '../validator';
import { subscriptionStateChangeFixtures } from '../fixtures/subscription-state-change.fixtures';
import { customerTransactionFixtures } from '../fixtures/customer-transaction.fixtures';
import { adSpendFixtures } from '../fixtures/ad-spend.fixtures';
import { productTelemetryFixtures } from '../fixtures/product-telemetry.fixtures';
import { crmLifecycleFixtures } from '../fixtures/crm-lifecycle.fixtures';

describe('Canonical Schemas - Sample Payloads & Fixtures Conformance', () => {
  const testNow = '2026-09-02T18:00:00.000Z';

  describe('subscription_state_change fixtures', () => {
    for (const [name, fixture] of Object.entries(subscriptionStateChangeFixtures)) {
      it(`validates fixture '${name}' without errors`, () => {
        const res = validateCanonicalEvent('subscription_state_change', fixture, { now: testNow });
        expect(res.valid).toBe(true);
        expect(res.errors).toBeUndefined();
        expect(res.data).toBeDefined();
        expect(res.data?.eventId).toBe(fixture.eventId);
      });
    }
  });

  describe('customer_transaction fixtures', () => {
    for (const [name, fixture] of Object.entries(customerTransactionFixtures)) {
      it(`validates fixture '${name}' without errors`, () => {
        const res = validateCanonicalEvent('customer_transaction', fixture, { now: testNow });
        expect(res.valid).toBe(true);
        expect(res.errors).toBeUndefined();
        expect(res.data).toBeDefined();
        expect(res.data?.eventId).toBe(fixture.eventId);
      });
    }
  });

  describe('ad_spend fixtures', () => {
    for (const [name, fixture] of Object.entries(adSpendFixtures)) {
      it(`validates fixture '${name}' without errors`, () => {
        const res = validateCanonicalEvent('ad_spend', fixture, { now: testNow });
        expect(res.valid).toBe(true);
        expect(res.errors).toBeUndefined();
        expect(res.data).toBeDefined();
        expect(res.data?.value).toBe(fixture.value);
      });
    }
  });

  describe('product_telemetry fixtures', () => {
    for (const [name, fixture] of Object.entries(productTelemetryFixtures)) {
      it(`validates fixture '${name}' without errors`, () => {
        const res = validateCanonicalEvent('product_telemetry', fixture, { now: testNow });
        expect(res.valid).toBe(true);
        expect(res.errors).toBeUndefined();
        expect(res.data).toBeDefined();
        expect(res.data?.eventId).toBe(fixture.eventId);
      });
    }
  });

  describe('crm_lifecycle fixtures', () => {
    for (const [name, fixture] of Object.entries(crmLifecycleFixtures)) {
      it(`validates fixture '${name}' without errors`, () => {
        const res = validateCanonicalEvent('crm_lifecycle', fixture, { now: testNow });
        expect(res.valid).toBe(true);
        expect(res.errors).toBeUndefined();
        expect(res.data).toBeDefined();
        expect(res.data?.eventId).toBe(fixture.eventId);
      });
    }
  });
});
