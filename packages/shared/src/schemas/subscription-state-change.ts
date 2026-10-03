import type { ValidationError, ValidationOptions, ValidationResult } from './types';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
  'incomplete',
  'incomplete_expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_CHANGE_TYPES = [
  'new',
  'upgrade',
  'downgrade',
  'renewal',
  'cancellation',
  'trial_start',
  'trial_convert',
  'reactivate',
  'payment_failed',
] as const;
export type SubscriptionChangeType = (typeof SUBSCRIPTION_CHANGE_TYPES)[number];

export const PLAN_INTERVALS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export interface SubscriptionStateChangeProperties {
  subscriptionId: string;
  previousStatus?: SubscriptionStatus;
  currentStatus: SubscriptionStatus;
  changeType: SubscriptionChangeType;
  /** MRR delta in currency minor units (e.g. +5000 for +$50.00 / month, -3000 for -$30.00 / month) */
  mrrDeltaCents: number;
  /** Current total MRR in currency minor units (e.g. 15000 for $150.00 / month) */
  currentMrrCents: number;
  /** ISO-4217 3-letter currency code (e.g. "USD", "EUR", "ILS") */
  currency: string;
  planInterval: PlanInterval;
  planId: string;
  planName?: string;
  quantity?: number;
  cancellationReasonCode?: string;
  cancellationComment?: string;
  provider?: 'stripe' | 'chargebee' | 'paddle' | 'recurly' | 'custom' | string;
  metadata?: Record<string, unknown>;
}

export interface SubscriptionStateChangeEvent {
  eventId: string;
  event: 'subscription_state_change';
  /** ISO-8601 UTC timestamp */
  ts: string;
  customerId: string;
  properties: SubscriptionStateChangeProperties;
}

export const SUBSCRIPTION_STATE_CHANGE_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SubscriptionStateChangeEvent',
  type: 'object',
  required: ['eventId', 'event', 'ts', 'customerId', 'properties'],
  additionalProperties: true,
  properties: {
    eventId: { type: 'string', minLength: 1, maxLength: 128 },
    event: { type: 'string', const: 'subscription_state_change' },
    ts: { type: 'string', format: 'date-time' },
    customerId: { type: 'string', minLength: 1, maxLength: 256 },
    properties: {
      type: 'object',
      required: [
        'subscriptionId',
        'currentStatus',
        'changeType',
        'mrrDeltaCents',
        'currentMrrCents',
        'currency',
        'planInterval',
        'planId',
      ],
      additionalProperties: true,
      properties: {
        subscriptionId: { type: 'string', minLength: 1, maxLength: 256 },
        previousStatus: { type: 'string', enum: SUBSCRIPTION_STATUSES as unknown as string[] },
        currentStatus: { type: 'string', enum: SUBSCRIPTION_STATUSES as unknown as string[] },
        changeType: { type: 'string', enum: SUBSCRIPTION_CHANGE_TYPES as unknown as string[] },
        mrrDeltaCents: { type: 'integer' },
        currentMrrCents: { type: 'integer', minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3, pattern: '^[A-Z]{3}$' },
        planInterval: { type: 'string', enum: PLAN_INTERVALS as unknown as string[] },
        planId: { type: 'string', minLength: 1, maxLength: 256 },
        planName: { type: 'string', maxLength: 256 },
        quantity: { type: 'integer', minimum: 1 },
        cancellationReasonCode: { type: 'string', maxLength: 128 },
        cancellationComment: { type: 'string', maxLength: 2048 },
        provider: { type: 'string', maxLength: 64 },
        metadata: { type: 'object' },
      },
    },
  },
};

export function validateSubscriptionStateChange(
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<SubscriptionStateChangeEvent> {
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

  const record = payload as Partial<SubscriptionStateChangeEvent>;

  // Check event name
  if (record.event !== 'subscription_state_change') {
    errors.push({
      path: 'event',
      message: `Event name must be 'subscription_state_change', received '${record.event}'`,
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

  const props = record.properties as Partial<SubscriptionStateChangeProperties>;

  // Check subscriptionId
  if (!props.subscriptionId || typeof props.subscriptionId !== 'string' || props.subscriptionId.trim().length === 0) {
    errors.push({
      path: 'properties.subscriptionId',
      message: 'subscriptionId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Check currentStatus
  if (!props.currentStatus || typeof props.currentStatus !== 'string') {
    errors.push({
      path: 'properties.currentStatus',
      message: 'currentStatus is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!SUBSCRIPTION_STATUSES.includes(props.currentStatus as SubscriptionStatus)) {
    errors.push({
      path: 'properties.currentStatus',
      message: `Invalid currentStatus '${props.currentStatus}'. Expected one of: ${SUBSCRIPTION_STATUSES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check previousStatus if provided
  if (props.previousStatus !== undefined && props.previousStatus !== null) {
    if (typeof props.previousStatus !== 'string' || !SUBSCRIPTION_STATUSES.includes(props.previousStatus as SubscriptionStatus)) {
      errors.push({
        path: 'properties.previousStatus',
        message: `Invalid previousStatus '${props.previousStatus}'. Expected one of: ${SUBSCRIPTION_STATUSES.join(', ')}`,
        code: 'INVALID_ENUM',
      });
    }
  }

  // Check changeType
  if (!props.changeType || typeof props.changeType !== 'string') {
    errors.push({
      path: 'properties.changeType',
      message: 'changeType is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!SUBSCRIPTION_CHANGE_TYPES.includes(props.changeType as SubscriptionChangeType)) {
    errors.push({
      path: 'properties.changeType',
      message: `Invalid changeType '${props.changeType}'. Expected one of: ${SUBSCRIPTION_CHANGE_TYPES.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check mrrDeltaCents
  if (props.mrrDeltaCents === undefined || props.mrrDeltaCents === null) {
    errors.push({
      path: 'properties.mrrDeltaCents',
      message: 'mrrDeltaCents is required and must be an integer',
      code: 'REQUIRED_FIELD',
    });
  } else if (typeof props.mrrDeltaCents !== 'number' || !Number.isInteger(props.mrrDeltaCents)) {
    errors.push({
      path: 'properties.mrrDeltaCents',
      message: 'mrrDeltaCents must be a valid integer in currency minor units (no decimal cents)',
      code: 'INVALID_TYPE',
    });
  }

  // Check currentMrrCents
  if (props.currentMrrCents === undefined || props.currentMrrCents === null) {
    errors.push({
      path: 'properties.currentMrrCents',
      message: 'currentMrrCents is required and must be a non-negative integer',
      code: 'REQUIRED_FIELD',
    });
  } else if (typeof props.currentMrrCents !== 'number' || !Number.isInteger(props.currentMrrCents) || props.currentMrrCents < 0) {
    errors.push({
      path: 'properties.currentMrrCents',
      message: 'currentMrrCents must be a non-negative integer in currency minor units',
      code: 'OUT_OF_RANGE',
    });
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

  // Check planInterval
  if (!props.planInterval || typeof props.planInterval !== 'string') {
    errors.push({
      path: 'properties.planInterval',
      message: 'planInterval is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!PLAN_INTERVALS.includes(props.planInterval as PlanInterval)) {
    errors.push({
      path: 'properties.planInterval',
      message: `Invalid planInterval '${props.planInterval}'. Expected one of: ${PLAN_INTERVALS.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }

  // Check planId
  if (!props.planId || typeof props.planId !== 'string' || props.planId.trim().length === 0) {
    errors.push({
      path: 'properties.planId',
      message: 'planId is required and must be a non-empty string',
      code: 'REQUIRED_FIELD',
    });
  }

  // Business logic cross-field validation
  if (props.changeType === 'cancellation' && props.currentStatus && props.currentStatus !== 'canceled') {
    errors.push({
      path: 'properties.currentStatus',
      message: `When changeType is 'cancellation', currentStatus must be 'canceled' (received '${props.currentStatus}')`,
      code: 'BUSINESS_LOGIC_VIOLATION',
    });
  }

  if (props.changeType === 'new' && props.previousStatus) {
    errors.push({
      path: 'properties.previousStatus',
      message: `When changeType is 'new', previousStatus should not be present (received '${props.previousStatus}')`,
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
      event: 'subscription_state_change',
      ts: record.ts!,
      customerId: record.customerId!,
      properties: {
        subscriptionId: props.subscriptionId!,
        previousStatus: props.previousStatus,
        currentStatus: props.currentStatus as SubscriptionStatus,
        changeType: props.changeType as SubscriptionChangeType,
        mrrDeltaCents: props.mrrDeltaCents!,
        currentMrrCents: props.currentMrrCents!,
        currency: props.currency!.toUpperCase(),
        planInterval: props.planInterval as PlanInterval,
        planId: props.planId!,
        planName: props.planName,
        quantity: props.quantity,
        cancellationReasonCode: props.cancellationReasonCode,
        cancellationComment: props.cancellationComment,
        provider: props.provider,
        metadata: props.metadata,
      },
    },
  };
}
