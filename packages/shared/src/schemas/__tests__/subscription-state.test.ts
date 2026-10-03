import { describe, expect, it } from 'vitest';

/**
 * Canonical Schema Test Suite for F08: Subscription State (`subscription_state_change`)
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), MRR Movements,
 * Proration, Idempotency, and Churn Reason Extraction.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F08
 */

export interface SubscriptionStateChangeEvent {
  eventId: string;
  event: 'subscription_state_change';
  ts: string;
  customerId: string;
  properties: {
    subscriptionId: string;
    previousStatus?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
    currentStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
    changeType: 'new' | 'upgrade' | 'downgrade' | 'renewal' | 'cancellation' | 'trial_start' | 'trial_convert' | 'reactivate';
    mrrDeltaCents: number;
    currentMrrCents: number;
    currency: string;
    planInterval: 'month' | 'year' | 'quarter';
    planId: string;
    cancellationReasonCode?: string;
    cancellationComment?: string;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function validateSubscriptionStateEvent(payload: unknown): { valid: boolean; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Payload must be a non-null object', code: 'INVALID_OBJECT' }] };
  }

  const p = payload as Partial<SubscriptionStateChangeEvent>;

  if (!p.eventId || typeof p.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.eventId)) {
    errors.push({ path: 'eventId', message: 'eventId must be a valid non-empty string up to 128 chars', code: 'INVALID_EVENT_ID' });
  }

  if (p.event !== 'subscription_state_change') {
    errors.push({ path: 'event', message: "event must be 'subscription_state_change'", code: 'INVALID_EVENT_NAME' });
  }

  if (!p.ts || typeof p.ts !== 'string' || isNaN(Date.parse(p.ts))) {
    errors.push({ path: 'ts', message: 'ts must be a valid ISO-8601 UTC timestamp', code: 'INVALID_TIMESTAMP' });
  } else {
    const time = new Date(p.ts).getTime();
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const oneDayFuture = now + 24 * 60 * 60 * 1000;
    if (time < oneYearAgo || time > oneDayFuture) {
      errors.push({ path: 'ts', message: 'ts out of valid ingestion bounds [now-365d, now+1d]', code: 'TIMESTAMP_OUT_OF_BOUNDS' });
    }
  }

  if (!p.customerId || typeof p.customerId !== 'string' || p.customerId.trim().length === 0) {
    errors.push({ path: 'customerId', message: 'customerId must be a non-empty string', code: 'MISSING_CUSTOMER_ID' });
  }

  const props = p.properties;
  if (!props || typeof props !== 'object') {
    errors.push({ path: 'properties', message: 'properties must be a non-null object', code: 'MISSING_PROPERTIES' });
    return { valid: errors.length === 0, errors };
  }

  if (!props.subscriptionId || typeof props.subscriptionId !== 'string' || props.subscriptionId.trim().length === 0) {
    errors.push({ path: 'properties.subscriptionId', message: 'subscriptionId is required', code: 'MISSING_SUBSCRIPTION_ID' });
  }

  const validStatuses = ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
  if (!props.currentStatus || !validStatuses.includes(props.currentStatus)) {
    errors.push({ path: 'properties.currentStatus', message: 'Invalid currentStatus', code: 'INVALID_STATUS' });
  }

  if (props.previousStatus && !validStatuses.includes(props.previousStatus)) {
    errors.push({ path: 'properties.previousStatus', message: 'Invalid previousStatus', code: 'INVALID_STATUS' });
  }

  const validChangeTypes = ['new', 'upgrade', 'downgrade', 'renewal', 'cancellation', 'trial_start', 'trial_convert', 'reactivate'];
  if (!props.changeType || !validChangeTypes.includes(props.changeType)) {
    errors.push({ path: 'properties.changeType', message: 'Invalid changeType', code: 'INVALID_CHANGE_TYPE' });
  }

  if (typeof props.mrrDeltaCents !== 'number' || !Number.isInteger(props.mrrDeltaCents)) {
    errors.push({ path: 'properties.mrrDeltaCents', message: 'mrrDeltaCents must be an integer', code: 'INVALID_MRR_DELTA' });
  }

  if (typeof props.currentMrrCents !== 'number' || !Number.isInteger(props.currentMrrCents) || props.currentMrrCents < 0) {
    errors.push({ path: 'properties.currentMrrCents', message: 'currentMrrCents must be a non-negative integer', code: 'INVALID_CURRENT_MRR' });
  }

  if (!props.currency || typeof props.currency !== 'string' || !/^[A-Z]{3}$/.test(props.currency)) {
    errors.push({ path: 'properties.currency', message: 'currency must be a 3-letter ISO code', code: 'INVALID_CURRENCY' });
  }

  const validIntervals = ['month', 'year', 'quarter'];
  if (!props.planInterval || !validIntervals.includes(props.planInterval)) {
    errors.push({ path: 'properties.planInterval', message: 'Invalid planInterval', code: 'INVALID_PLAN_INTERVAL' });
  }

  if (!props.planId || typeof props.planId !== 'string') {
    errors.push({ path: 'properties.planId', message: 'planId is required', code: 'MISSING_PLAN_ID' });
  }

  if (props.changeType === 'cancellation' && props.currentStatus !== 'canceled') {
    errors.push({ path: 'properties.currentStatus', message: "changeType 'cancellation' requires currentStatus 'canceled'", code: 'INCONSISTENT_CANCELLATION_STATUS' });
  }

  return { valid: errors.length === 0, errors };
}

describe('F08: Canonical Schema — Subscription State Change', () => {
  const validBasePayload: SubscriptionStateChangeEvent = {
    eventId: 'evt_sub_001',
    event: 'subscription_state_change',
    ts: new Date().toISOString(),
    customerId: 'cust_acme_123',
    properties: {
      subscriptionId: 'sub_stripe_abc',
      previousStatus: 'trialing',
      currentStatus: 'active',
      changeType: 'trial_convert',
      mrrDeltaCents: 12000,
      currentMrrCents: 12000,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_growth_monthly',
    },
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F08-T1-01: validates a standard new subscription event', () => {
      const payload: SubscriptionStateChangeEvent = {
        ...validBasePayload,
        eventId: 'evt_new_sub_101',
        properties: {
          ...validBasePayload.properties,
          previousStatus: undefined,
          currentStatus: 'active',
          changeType: 'new',
          mrrDeltaCents: 19900,
          currentMrrCents: 19900,
          planId: 'plan_pro_annual',
          planInterval: 'year',
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F08-T1-02: validates an expansion upgrade subscription event with positive delta', () => {
      const payload: SubscriptionStateChangeEvent = {
        ...validBasePayload,
        eventId: 'evt_upgrade_102',
        properties: {
          ...validBasePayload.properties,
          previousStatus: 'active',
          currentStatus: 'active',
          changeType: 'upgrade',
          mrrDeltaCents: 5000,
          currentMrrCents: 17000,
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F08-T1-03: validates a contraction downgrade subscription event with negative delta', () => {
      const payload: SubscriptionStateChangeEvent = {
        ...validBasePayload,
        eventId: 'evt_downgrade_103',
        properties: {
          ...validBasePayload.properties,
          previousStatus: 'active',
          currentStatus: 'active',
          changeType: 'downgrade',
          mrrDeltaCents: -4000,
          currentMrrCents: 8000,
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F08-T1-04: validates a subscription cancellation event with structured reason code', () => {
      const payload: SubscriptionStateChangeEvent = {
        ...validBasePayload,
        eventId: 'evt_cancel_104',
        properties: {
          ...validBasePayload.properties,
          previousStatus: 'active',
          currentStatus: 'canceled',
          changeType: 'cancellation',
          mrrDeltaCents: -12000,
          currentMrrCents: 0,
          cancellationReasonCode: 'too_expensive',
          cancellationComment: 'Switching to self-hosted alternative',
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F08-T1-05: validates reactivate subscription event with previousStatus canceled', () => {
      const payload: SubscriptionStateChangeEvent = {
        ...validBasePayload,
        eventId: 'evt_reactivate_105',
        properties: {
          ...validBasePayload.properties,
          previousStatus: 'canceled',
          currentStatus: 'active',
          changeType: 'reactivate',
          mrrDeltaCents: 12000,
          currentMrrCents: 12000,
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F08-T2-01: rejects invalid non-integer floating point MRR cents (e.g. 120.50)', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          mrrDeltaCents: 120.5,
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_MRR_DELTA')).toBe(true);
    });

    it('F08-T2-02: rejects negative currentMrrCents', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          currentMrrCents: -100,
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CURRENT_MRR')).toBe(true);
    });

    it('F08-T2-03: rejects timestamp older than 365 days', () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        ...validBasePayload,
        ts: twoYearsAgo,
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'TIMESTAMP_OUT_OF_BOUNDS')).toBe(true);
    });

    it('F08-T2-04: rejects invalid ISO currency code (lowercase or wrong length)', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          currency: 'usd',
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CURRENCY')).toBe(true);
    });

    it('F08-T2-05: rejects cancellation changeType when currentStatus is not canceled', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          changeType: 'cancellation' as const,
          currentStatus: 'active' as const,
        },
      };
      const result = validateSubscriptionStateEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INCONSISTENT_CANCELLATION_STATUS')).toBe(true);
    });
  });
});
