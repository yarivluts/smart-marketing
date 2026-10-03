/**
 * Canonical Schema Contracts & Ingestion Types for GrowthOS.
 *
 * Provides core type definitions, validation interfaces, and error structures
 * for the 5 canonical event and measure schemas.
 */

export type CanonicalEventType =
  | 'subscription_state_change'
  | 'customer_transaction'
  | 'ad_spend'
  | 'product_telemetry'
  | 'crm_lifecycle';

export const CANONICAL_EVENT_TYPES: readonly CanonicalEventType[] = [
  'subscription_state_change',
  'customer_transaction',
  'ad_spend',
  'product_telemetry',
  'crm_lifecycle',
] as const;

export type ValidationErrorCode =
  | 'REQUIRED_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_FORMAT'
  | 'OUT_OF_RANGE'
  | 'INVALID_ENUM'
  | 'CLOCK_SKEW_FUTURE'
  | 'CLOCK_SKEW_PAST'
  | 'NEGATIVE_SPEND'
  | 'BUSINESS_LOGIC_VIOLATION'
  | 'UNKNOWN_EVENT_TYPE'
  | 'INVALID_PAYLOAD';

export interface ValidationError {
  path: string;
  message: string;
  code: ValidationErrorCode | string;
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
  quarantined?: boolean;
  quarantineReason?: string;
}

export interface ValidationOptions {
  /**
   * Reference timestamp for clock-skew checks (defaults to `new Date()`).
   * Accepts ISO string, epoch milliseconds, or Date object.
   */
  now?: string | number | Date;
  /**
   * Maximum allowed future clock skew in seconds (default: 86400 = 24 hours / 1 day).
   */
  maxFutureSkewSeconds?: number;
  /**
   * Maximum allowed past clock skew in seconds (default: 31536000 = 365 days / 1 year).
   */
  maxPastSkewSeconds?: number;
  /**
   * Whether to allow negative spend (default: false; negative spend is quarantined).
   */
  allowNegativeSpend?: boolean;
  /**
   * Whether to fail on unlisted/unexpected top-level properties.
   */
  strict?: boolean;
}
