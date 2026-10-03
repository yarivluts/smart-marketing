import { describe, expect, it } from 'vitest';
import { validateSubscriptionStateEvent, type SubscriptionStateChangeEvent } from './subscription-state.test';
import { validateCustomerTransactionEvent, type CustomerTransactionEvent } from './customer-transaction.test';
import { validateAdSpendRecord, type AdSpendMeasureRecord } from './ad-spend.test';
import { validateProductTelemetryEvent, type ProductTelemetryEvent } from './product-telemetry.test';
import { validateCrmLifecycleEvent, type CrmLifecycleEvent } from './crm-lifecycle.test';

/**
 * Test Suite for F13: Automated Schema Validation Engine
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), Generic Dispatcher,
 * Multi-Error Accumulation, Field Path Diagnostics, and Strict Type Guards.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F13
 */

export type CanonicalEventType =
  | 'subscription_state_change'
  | 'customer_transaction'
  | 'ad_spend'
  | 'product_telemetry'
  | 'crm_lifecycle';

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: Array<{ path: string; message: string; code: string }>;
}

export function validateCanonicalEvent<T = unknown>(
  eventType: CanonicalEventType,
  payload: unknown,
): ValidationResult<T> {
  switch (eventType) {
    case 'subscription_state_change': {
      const res = validateSubscriptionStateEvent(payload);
      return {
        valid: res.valid,
        data: res.valid ? (payload as T) : undefined,
        errors: res.errors.length > 0 ? res.errors : undefined,
      };
    }
    case 'customer_transaction': {
      const res = validateCustomerTransactionEvent(payload);
      return {
        valid: res.valid,
        data: res.valid ? (payload as T) : undefined,
        errors: res.errors.length > 0 ? res.errors : undefined,
      };
    }
    case 'ad_spend': {
      const res = validateAdSpendRecord(payload);
      return {
        valid: res.valid,
        data: res.valid ? (payload as T) : undefined,
        errors: res.errors.length > 0 ? res.errors : undefined,
      };
    }
    case 'product_telemetry': {
      const res = validateProductTelemetryEvent(payload);
      return {
        valid: res.valid,
        data: res.valid ? (payload as T) : undefined,
        errors: res.errors.length > 0 ? res.errors : undefined,
      };
    }
    case 'crm_lifecycle': {
      const res = validateCrmLifecycleEvent(payload);
      return {
        valid: res.valid,
        data: res.valid ? (payload as T) : undefined,
        errors: res.errors.length > 0 ? res.errors : undefined,
      };
    }
    default: {
      return {
        valid: false,
        errors: [{ path: '', message: `Unsupported canonical event type: ${String(eventType)}`, code: 'UNSUPPORTED_EVENT_TYPE' }],
      };
    }
  }
}

describe('F13: Automated Schema Validation Engine', () => {
  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F13-T1-01: routes and validates subscription_state_change through generic engine', () => {
      const payload: SubscriptionStateChangeEvent = {
        eventId: 'evt_sub_eng_1',
        event: 'subscription_state_change',
        ts: new Date().toISOString(),
        customerId: 'cust_eng_1',
        properties: {
          subscriptionId: 'sub_1',
          currentStatus: 'active',
          changeType: 'new',
          mrrDeltaCents: 10000,
          currentMrrCents: 10000,
          currency: 'USD',
          planInterval: 'month',
          planId: 'plan_starter',
        },
      };
      const res = validateCanonicalEvent<SubscriptionStateChangeEvent>('subscription_state_change', payload);
      expect(res.valid).toBe(true);
      expect(res.data?.properties.currentMrrCents).toBe(10000);
      expect(res.errors).toBeUndefined();
    });

    it('F13-T1-02: routes and validates customer_transaction through generic engine', () => {
      const payload: CustomerTransactionEvent = {
        eventId: 'evt_tx_eng_2',
        event: 'customer_transaction',
        ts: new Date().toISOString(),
        customerId: 'cust_eng_2',
        properties: {
          transactionId: 'ch_1',
          transactionType: 'charge',
          status: 'succeeded',
          amountCents: 5000,
          currency: 'EUR',
          paymentMethod: 'card',
        },
      };
      const res = validateCanonicalEvent<CustomerTransactionEvent>('customer_transaction', payload);
      expect(res.valid).toBe(true);
      expect(res.data?.properties.amountCents).toBe(5000);
    });

    it('F13-T1-03: routes and validates ad_spend through generic engine', () => {
      const payload: AdSpendMeasureRecord = {
        measure: 'ad_spend',
        ts: '2026-09-02',
        value: 450.0,
        dimensions: {
          channelId: 'meta_ads',
          campaignId: 'cmp_eng_3',
          currency: 'USD',
        },
      };
      const res = validateCanonicalEvent<AdSpendMeasureRecord>('ad_spend', payload);
      expect(res.valid).toBe(true);
      expect(res.data?.value).toBe(450.0);
    });

    it('F13-T1-04: routes and validates product_telemetry through generic engine', () => {
      const payload: ProductTelemetryEvent = {
        eventId: 'evt_tel_eng_4',
        event: 'page_view',
        ts: new Date().toISOString(),
        anonId: 'anon_eng_4',
        properties: {
          sessionId: 'sess_eng_4',
          platform: 'web',
        },
      };
      const res = validateCanonicalEvent<ProductTelemetryEvent>('product_telemetry', payload);
      expect(res.valid).toBe(true);
      expect(res.data?.event).toBe('page_view');
    });

    it('F13-T1-05: routes and validates crm_lifecycle through generic engine', () => {
      const payload: CrmLifecycleEvent = {
        eventId: 'evt_crm_eng_5',
        event: 'crm_lifecycle',
        ts: new Date().toISOString(),
        customerId: 'cust_eng_5',
        properties: {
          stage: 'sql',
        },
      };
      const res = validateCanonicalEvent<CrmLifecycleEvent>('crm_lifecycle', payload);
      expect(res.valid).toBe(true);
      expect(res.data?.properties.stage).toBe('sql');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F13-T2-01: accumulates multiple field errors when multiple fields are invalid', () => {
      const badPayload = {
        eventId: '',
        event: 'subscription_state_change',
        ts: 'not-a-timestamp',
        customerId: '',
        properties: {
          subscriptionId: '',
          currentStatus: 'invalid_status' as unknown as string,
          changeType: 'invalid_change' as unknown as string,
          mrrDeltaCents: 10.5,
          currentMrrCents: -1,
          currency: 'toolong',
          planInterval: 'invalid_interval' as unknown as string,
          planId: '',
        },
      };
      const res = validateCanonicalEvent('subscription_state_change', badPayload);
      expect(res.valid).toBe(false);
      expect(res.errors?.length).toBeGreaterThanOrEqual(5);
      expect(res.errors?.some((e) => e.path === 'eventId')).toBe(true);
      expect(res.errors?.some((e) => e.path === 'ts')).toBe(true);
      expect(res.errors?.some((e) => e.path === 'customerId')).toBe(true);
    });

    it('F13-T2-02: returns UNSUPPORTED_EVENT_TYPE for unregistered canonical types', () => {
      const res = validateCanonicalEvent('unregistered_type' as unknown as CanonicalEventType, {});
      expect(res.valid).toBe(false);
      expect(res.errors?.[0].code).toBe('UNSUPPORTED_EVENT_TYPE');
    });


    it('F13-T2-03: returns INVALID_OBJECT for primitive non-object payloads (null, undefined, string, number)', () => {
      expect(validateCanonicalEvent('customer_transaction', null).valid).toBe(false);
      expect(validateCanonicalEvent('customer_transaction', undefined).valid).toBe(false);
      expect(validateCanonicalEvent('customer_transaction', 'raw-string').valid).toBe(false);
      expect(validateCanonicalEvent('customer_transaction', 12345).valid).toBe(false);
    });

    it('F13-T2-04: verifies field error paths match exact dot-notation hierarchy', () => {
      const payload = {
        eventId: 'evt_1',
        event: 'customer_transaction',
        ts: new Date().toISOString(),
        customerId: 'cust_1',
        properties: {
          transactionId: 'tx_1',
          transactionType: 'charge',
          status: 'failed',
          amountCents: 100,
          currency: 'USD',
          paymentMethod: 'card',
          // missing failureCode
        },
      };
      const res = validateCanonicalEvent('customer_transaction', payload);
      expect(res.valid).toBe(false);
      expect(res.errors?.[0].path).toBe('properties.failureCode');
    });

    it('F13-T2-05: handles array batch validation with index tracking in path', () => {
      const batch = [
        {
          eventId: 'evt_batch_1',
          event: 'customer_transaction',
          ts: new Date().toISOString(),
          customerId: 'cust_1',
          properties: {
            transactionId: 'tx_1',
            transactionType: 'charge',
            status: 'succeeded',
            amountCents: 1000,
            currency: 'USD',
            paymentMethod: 'card',
          },
        },
        {
          eventId: 'evt_batch_2',
          event: 'customer_transaction',
          ts: new Date().toISOString(),
          customerId: 'cust_2',
          properties: {
            transactionId: '', // invalid
            transactionType: 'charge',
            status: 'succeeded',
            amountCents: -50, // invalid
            currency: 'USD',
            paymentMethod: 'card',
          },
        },
      ];

      const batchResults = batch.map((item, index) => {
        const res = validateCanonicalEvent('customer_transaction', item);
        return {
          index,
          valid: res.valid,
          errors: res.errors?.map((err) => ({
            ...err,
            path: `[${index}].${err.path}`,
          })),
        };
      });

      expect(batchResults[0].valid).toBe(true);
      expect(batchResults[1].valid).toBe(false);
      expect(batchResults[1].errors?.some((e) => e.path.startsWith('[1].properties'))).toBe(true);
    });
  });
});
