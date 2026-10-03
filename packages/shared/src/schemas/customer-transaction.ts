import type { ValidationError, ValidationOptions, ValidationResult } from './types';

export const TRANSACTION_TYPES = [
  'charge',
  'first_charge',
  'recurring_renewal',
  'plan_upgrade',
  'addon_payment',
  'refund',
  'dispute',
  'adjustment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['succeeded', 'failed', 'pending', 'reversed'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHOD_TYPES = [
  'card',
  'bank_transfer',
  'paypal',
  'apple_pay',
  'google_pay',
  'crypto',
  'other',
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export interface CustomerTransactionProperties {
  transactionId: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  /** Amount in currency minor units (e.g. 12000 for $120.00) */
  amountCents: number;
  /** Refunded amount in currency minor units (if partially or fully refunded) */
  refundedAmountCents?: number;
  /** ISO-4217 3-letter currency code (e.g. "USD", "EUR", "ILS") */
  currency: string;
  paymentMethod?: PaymentMethodType | string;
  failureCode?: string;
  failureMessage?: string;
  invoiceId?: string;
  subscriptionId?: string;
  provider?: 'stripe' | 'chargebee' | 'paddle' | 'recurly' | 'shopify' | 'custom' | string;
  billingEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerTransactionEvent {
  eventId: string;
  event: 'customer_transaction';
  /** ISO-8601 UTC timestamp */
  ts: string;
  customerId: string;
  properties: CustomerTransactionProperties;
}

export const CUSTOMER_TRANSACTION_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'CustomerTransactionEvent',
  type: 'object',
  required: ['eventId', 'event', 'ts', 'customerId', 'properties'],
  additionalProperties: true,
  properties: {
    eventId: { type: 'string', minLength: 1, maxLength: 128 },
    event: { type: 'string', const: 'customer_transaction' },
    ts: { type: 'string', format: 'date-time' },
    customerId: { type: 'string', minLength: 1, maxLength: 256 },
    properties: {
      type: 'object',
      required: ['transactionId', 'transactionType', 'status', 'amountCents', 'currency'],
      additionalProperties: true,
      properties: {
        transactionId: { type: 'string', minLength: 1, maxLength: 256 },
        transactionType: { type: 'string', enum: TRANSACTION_TYPES as unknown as string[] },
        status: { type: 'string', enum: TRANSACTION_STATUSES as unknown as string[] },
        amountCents: { type: 'integer', minimum: 0 },
        refundedAmountCents: { type: 'integer', minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3, pattern: '^[A-Z]{3}$' },
        paymentMethod: { type: 'string', maxLength: 64 },
        failureCode: { type: 'string', maxLength: 128 },
        failureMessage: { type: 'string', maxLength: 2048 },
        invoiceId: { type: 'string', maxLength: 256 },
        subscriptionId: { type: 'string', maxLength: 256 },
        provider: { type: 'string', maxLength: 64 },
        billingEmail: { type: 'string', format: 'email', maxLength: 256 },
        metadata: { type: 'object' },
      },
    },
  },
};

export function validateCustomerTransaction(
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<CustomerTransactionEvent> {
  const errors: ValidationError[] = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: 'Payload must be a non-null object',
          code: 'INVALID_PAYLOAD',
        },
      ],
    };
  }

  const record = payload as Partial<CustomerTransactionEvent>;

  // Check event name
  if (record.event !== 'customer_transaction') {
    errors.push({
      path: 'event',
      message: `Event name must be 'customer_transaction', received '${record.event}'`,
      code: 'INVALID_ENUM',
    });
  }

  // Check eventId
  if (!record.eventId || typeof record.eventId !== 'string' || record.eventId.trim().length === 0) {
    errors.push({
      path: 'eventId',
      message: 'eventId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check ts
  if (!record.ts || typeof record.ts !== 'string') {
    errors.push({
      path: 'ts',
      message: 'ts is required and must be an ISO-8601 timestamp string',
      code: 'REQUIRED_FIELD',
    });
  } else {
    const parsedTs = Date.parse(record.ts);
    if (Number.isNaN(parsedTs)) {
      errors.push({
        path: 'ts',
        message: `Invalid ISO-8601 date timestamp: ${record.ts}`,
        code: 'INVALID_FORMAT',
      });
    } else {
      // Clock skew verification
      const nowMs = options?.now ? new Date(options.now).getTime() : Date.now();
      const maxFutureMs = (options?.maxFutureSkewSeconds ?? 86400) * 1000;
      const maxPastMs = (options?.maxPastSkewSeconds ?? 31536000) * 1000;

      if (parsedTs > nowMs + maxFutureMs) {
        errors.push({
          path: 'ts',
          message: `Timestamp is too far in the future (${record.ts}), exceeds max allowed skew of ${options?.maxFutureSkewSeconds ?? 86400}s`,
          code: 'CLOCK_SKEW_FUTURE',
        });
      } else if (parsedTs < nowMs - maxPastMs) {
        errors.push({
          path: 'ts',
          message: `Timestamp is too far in the past (${record.ts}), exceeds max allowed retention of ${options?.maxPastSkewSeconds ?? 31536000}s`,
          code: 'CLOCK_SKEW_PAST',
        });
      }
    }
  }

  // Check customerId
  if (!record.customerId || typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    errors.push({
      path: 'customerId',
      message: 'customerId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check properties object
  if (!record.properties || typeof record.properties !== 'object' || Array.isArray(record.properties)) {
    errors.push({
      path: 'properties',
      message: 'properties is required and must be an object',
      code: 'REQUIRED_FIELD',
    });
    return {
      valid: false,
      errors,
    };
  }

  const props = record.properties as Partial<CustomerTransactionProperties>;

  // Check transactionId
  if (!props.transactionId || typeof props.transactionId !== 'string' || props.transactionId.trim().length === 0) {
    errors.push({
      path: 'properties.transactionId',
      message: 'transactionId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check transactionType
  if (!props.transactionType || typeof props.transactionType !== 'string') {
    errors.push({
      path: 'properties.transactionType',
      message: 'transactionType is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!TRANSACTION_TYPES.includes(props.transactionType as TransactionType)) {
    errors.push({
      path: 'properties.transactionType',
      message: `Invalid transactionType '${props.transactionType}'. Expected one of: ${TRANSACTION_TYPES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check status
  if (!props.status || typeof props.status !== 'string') {
    errors.push({
      path: 'properties.status',
      message: 'status is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!TRANSACTION_STATUSES.includes(props.status as TransactionStatus)) {
    errors.push({
      path: 'properties.status',
      message: `Invalid status '${props.status}'. Expected one of: ${TRANSACTION_STATUSES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check amountCents
  if (props.amountCents === undefined || props.amountCents === null) {
    errors.push({
      path: 'properties.amountCents',
      message: 'amountCents is required and must be a non-negative integer',
      code: 'REQUIRED_FIELD',
    });
  } else if (typeof props.amountCents !== 'number' || !Number.isInteger(props.amountCents) || props.amountCents < 0) {
    errors.push({
      path: 'properties.amountCents',
      message: 'amountCents must be a non-negative integer in currency minor units',
      code: 'OUT_OF_RANGE',
    });
  }

  // Check refundedAmountCents if present
  if (props.refundedAmountCents !== undefined && props.refundedAmountCents !== null) {
    if (typeof props.refundedAmountCents !== 'number' || !Number.isInteger(props.refundedAmountCents) || props.refundedAmountCents < 0) {
      errors.push({
        path: 'properties.refundedAmountCents',
        message: 'refundedAmountCents must be a non-negative integer in currency minor units',
        code: 'OUT_OF_RANGE',
      });
    } else if (props.amountCents !== undefined && props.refundedAmountCents > props.amountCents) {
      errors.push({
        path: 'properties.refundedAmountCents',
        message: `refundedAmountCents (${props.refundedAmountCents}) cannot exceed total amountCents (${props.amountCents})`,
        code: 'BUSINESS_LOGIC_VIOLATION',
      });
    }
  }

  // Check currency
  if (!props.currency || typeof props.currency !== 'string') {
    errors.push({
      path: 'properties.currency',
      message: 'currency is required and must be a 3-letter ISO-4217 uppercase code',
      code: 'REQUIRED_FIELD',
    });
  } else if (!/^[A-Z]{3}$/.test(props.currency.toUpperCase())) {
    errors.push({
      path: 'properties.currency',
      message: `Invalid currency format '${props.currency}'. Must be 3-letter ISO code (e.g. USD, EUR, ILS)`,
      code: 'INVALID_FORMAT',
    });
  }

  // Failure checks
  if (props.status === 'failed' && !props.failureCode && !props.failureMessage) {
    errors.push({
      path: 'properties.failureCode',
      message: "When transaction status is 'failed', failureCode or failureMessage must be provided",
      code: 'BUSINESS_LOGIC_VIOLATION',
    });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    data: {
      eventId: record.eventId!,
      event: 'customer_transaction',
      ts: record.ts!,
      customerId: record.customerId!,
      properties: {
        transactionId: props.transactionId!,
        transactionType: props.transactionType as TransactionType,
        status: props.status as TransactionStatus,
        amountCents: props.amountCents!,
        refundedAmountCents: props.refundedAmountCents,
        currency: props.currency!.toUpperCase(),
        paymentMethod: props.paymentMethod,
        failureCode: props.failureCode,
        failureMessage: props.failureMessage,
        invoiceId: props.invoiceId,
        subscriptionId: props.subscriptionId,
        provider: props.provider,
        billingEmail: props.billingEmail,
        metadata: props.metadata,
      },
    },
  };
}
