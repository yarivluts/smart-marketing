import { describe, expect, it } from 'vitest';

/**
 * Canonical Schema Test Suite for F09: Customer Transactions (`customer_transaction`)
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), Integer Cents,
 * Refund Constraints, Failure Codes, and Currency Normalization.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F09
 */

export interface CustomerTransactionEvent {
  eventId: string;
  event: 'customer_transaction';
  ts: string;
  customerId: string;
  properties: {
    transactionId: string;
    transactionType: 'charge' | 'first_charge' | 'refund' | 'dispute' | 'adjustment';
    status: 'succeeded' | 'failed' | 'pending';
    amountCents: number;
    refundedAmountCents?: number;
    currency: string;
    paymentMethod: 'card' | 'bank_transfer' | 'paypal' | 'other';
    failureCode?: string;
    failureMessage?: string;
    invoiceId?: string;
    subscriptionId?: string;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function validateCustomerTransactionEvent(payload: unknown): { valid: boolean; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Payload must be a non-null object', code: 'INVALID_OBJECT' }] };
  }

  const p = payload as Partial<CustomerTransactionEvent>;

  if (!p.eventId || typeof p.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.eventId)) {
    errors.push({ path: 'eventId', message: 'eventId must be a non-empty string up to 128 chars', code: 'INVALID_EVENT_ID' });
  }

  if (p.event !== 'customer_transaction') {
    errors.push({ path: 'event', message: "event must be 'customer_transaction'", code: 'INVALID_EVENT_NAME' });
  }

  if (!p.ts || typeof p.ts !== 'string' || isNaN(Date.parse(p.ts))) {
    errors.push({ path: 'ts', message: 'ts must be a valid ISO-8601 UTC timestamp', code: 'INVALID_TIMESTAMP' });
  }

  if (!p.customerId || typeof p.customerId !== 'string' || p.customerId.trim().length === 0) {
    errors.push({ path: 'customerId', message: 'customerId must be a non-empty string', code: 'MISSING_CUSTOMER_ID' });
  }

  const props = p.properties;
  if (!props || typeof props !== 'object') {
    errors.push({ path: 'properties', message: 'properties must be a non-null object', code: 'MISSING_PROPERTIES' });
    return { valid: errors.length === 0, errors };
  }

  if (!props.transactionId || typeof props.transactionId !== 'string' || props.transactionId.trim().length === 0) {
    errors.push({ path: 'properties.transactionId', message: 'transactionId is required', code: 'MISSING_TRANSACTION_ID' });
  }

  const validTypes = ['charge', 'first_charge', 'refund', 'dispute', 'adjustment'];
  if (!props.transactionType || !validTypes.includes(props.transactionType)) {
    errors.push({ path: 'properties.transactionType', message: 'Invalid transactionType', code: 'INVALID_TRANSACTION_TYPE' });
  }

  const validStatuses = ['succeeded', 'failed', 'pending'];
  if (!props.status || !validStatuses.includes(props.status)) {
    errors.push({ path: 'properties.status', message: 'Invalid status', code: 'INVALID_STATUS' });
  }

  if (typeof props.amountCents !== 'number' || !Number.isInteger(props.amountCents) || props.amountCents < 0) {
    errors.push({ path: 'properties.amountCents', message: 'amountCents must be a non-negative integer', code: 'INVALID_AMOUNT_CENTS' });
  }

  if (props.refundedAmountCents !== undefined) {
    if (typeof props.refundedAmountCents !== 'number' || !Number.isInteger(props.refundedAmountCents) || props.refundedAmountCents < 0) {
      errors.push({ path: 'properties.refundedAmountCents', message: 'refundedAmountCents must be a non-negative integer', code: 'INVALID_REFUND_AMOUNT' });
    } else if (props.amountCents !== undefined && props.refundedAmountCents > props.amountCents) {
      errors.push({ path: 'properties.refundedAmountCents', message: 'refundedAmountCents cannot exceed amountCents', code: 'REFUND_EXCEEDS_AMOUNT' });
    }
  }

  if (!props.currency || typeof props.currency !== 'string' || !/^[A-Z]{3}$/.test(props.currency)) {
    errors.push({ path: 'properties.currency', message: 'currency must be a 3-letter ISO-4217 code', code: 'INVALID_CURRENCY' });
  }

  const validMethods = ['card', 'bank_transfer', 'paypal', 'other'];
  if (!props.paymentMethod || !validMethods.includes(props.paymentMethod)) {
    errors.push({ path: 'properties.paymentMethod', message: 'Invalid paymentMethod', code: 'INVALID_PAYMENT_METHOD' });
  }

  if (props.status === 'failed' && (!props.failureCode || typeof props.failureCode !== 'string')) {
    errors.push({ path: 'properties.failureCode', message: "failureCode is required when status is 'failed'", code: 'MISSING_FAILURE_CODE' });
  }

  return { valid: errors.length === 0, errors };
}

describe('F09: Canonical Schema — Customer Transactions', () => {
  const validBasePayload: CustomerTransactionEvent = {
    eventId: 'evt_tx_201',
    event: 'customer_transaction',
    ts: new Date().toISOString(),
    customerId: 'cust_corp_99',
    properties: {
      transactionId: 'ch_stripe_555',
      transactionType: 'first_charge',
      status: 'succeeded',
      amountCents: 15000,
      currency: 'USD',
      paymentMethod: 'card',
      invoiceId: 'in_999888',
      subscriptionId: 'sub_777666',
    },
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F09-T1-01: validates a first_charge transaction event', () => {
      const result = validateCustomerTransactionEvent(validBasePayload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F09-T1-02: validates a recurring renewal charge transaction', () => {
      const payload: CustomerTransactionEvent = {
        ...validBasePayload,
        eventId: 'evt_tx_202',
        properties: {
          ...validBasePayload.properties,
          transactionId: 'ch_stripe_556',
          transactionType: 'charge',
          amountCents: 15000,
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F09-T1-03: validates a partial refund transaction event', () => {
      const payload: CustomerTransactionEvent = {
        ...validBasePayload,
        eventId: 'evt_tx_203',
        properties: {
          ...validBasePayload.properties,
          transactionId: 're_stripe_301',
          transactionType: 'refund',
          amountCents: 15000,
          refundedAmountCents: 5000,
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F09-T1-04: validates a failed charge transaction event with required failureCode', () => {
      const payload: CustomerTransactionEvent = {
        ...validBasePayload,
        eventId: 'evt_tx_204',
        properties: {
          ...validBasePayload.properties,
          transactionId: 'ch_stripe_failed_1',
          status: 'failed',
          amountCents: 15000,
          failureCode: 'card_declined',
          failureMessage: 'The card was declined due to insufficient funds',
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F09-T1-05: validates an alternative currency transaction (ILS / EUR)', () => {
      const payload: CustomerTransactionEvent = {
        ...validBasePayload,
        eventId: 'evt_tx_205',
        properties: {
          ...validBasePayload.properties,
          transactionId: 'ch_stripe_ils_1',
          amountCents: 55000,
          currency: 'ILS',
          paymentMethod: 'bank_transfer',
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F09-T2-01: rejects negative amountCents', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          amountCents: -500,
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_AMOUNT_CENTS')).toBe(true);
    });

    it('F09-T2-02: rejects refundedAmountCents exceeding original amountCents', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          transactionType: 'refund' as const,
          amountCents: 10000,
          refundedAmountCents: 15000,
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'REFUND_EXCEEDS_AMOUNT')).toBe(true);
    });

    it('F09-T2-03: rejects failed status missing failureCode', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          status: 'failed' as const,
          failureCode: undefined,
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_FAILURE_CODE')).toBe(true);
    });

    it('F09-T2-04: rejects non-integer amountCents (e.g. decimal 149.99)', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          amountCents: 149.99,
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_AMOUNT_CENTS')).toBe(true);
    });

    it('F09-T2-05: rejects missing or whitespace-only transactionId', () => {
      const payload = {
        ...validBasePayload,
        properties: {
          ...validBasePayload.properties,
          transactionId: '   ',
        },
      };
      const result = validateCustomerTransactionEvent(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_TRANSACTION_ID')).toBe(true);
    });
  });
});
