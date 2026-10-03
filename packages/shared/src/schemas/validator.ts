import type {
  CanonicalEventType,
  ValidationOptions,
  ValidationResult,
} from './types';
import {
  type SubscriptionStateChangeEvent,
  validateSubscriptionStateChange,
} from './subscription-state-change';
import {
  type CustomerTransactionEvent,
  validateCustomerTransaction,
} from './customer-transaction';
import {
  type AdSpendMeasureRecord,
  validateAdSpend,
} from './ad-spend';
import {
  type ProductTelemetryEvent,
  validateProductTelemetry,
} from './product-telemetry';
import {
  type CrmLifecycleEvent,
  validateCrmLifecycle,
} from './crm-lifecycle';

export type CanonicalEventPayload =
  | SubscriptionStateChangeEvent
  | CustomerTransactionEvent
  | AdSpendMeasureRecord
  | ProductTelemetryEvent
  | CrmLifecycleEvent;

/**
 * Universal validation engine for all GrowthOS canonical schemas.
 *
 * Validates any canonical event or measure payload against its specification,
 * performing clock-skew checks, negative spend detection/quarantine,
 * type checking, enum matching, and domain-specific business rules.
 */
export function validateCanonicalEvent(
  eventType: 'subscription_state_change',
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<SubscriptionStateChangeEvent>;

export function validateCanonicalEvent(
  eventType: 'customer_transaction',
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<CustomerTransactionEvent>;

export function validateCanonicalEvent(
  eventType: 'ad_spend',
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<AdSpendMeasureRecord>;

export function validateCanonicalEvent(
  eventType: 'product_telemetry',
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<ProductTelemetryEvent>;

export function validateCanonicalEvent(
  eventType: 'crm_lifecycle',
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<CrmLifecycleEvent>;

export function validateCanonicalEvent(
  eventType: CanonicalEventType | string,
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<CanonicalEventPayload>;

export function validateCanonicalEvent(
  eventType: CanonicalEventType | string,
  payload: unknown,
  options?: ValidationOptions
): ValidationResult<CanonicalEventPayload> {
  switch (eventType) {
    case 'subscription_state_change':
      return validateSubscriptionStateChange(payload, options);
    case 'customer_transaction':
      return validateCustomerTransaction(payload, options);
    case 'ad_spend':
      return validateAdSpend(payload, options);
    case 'product_telemetry':
      return validateProductTelemetry(payload, options);
    case 'crm_lifecycle':
      return validateCrmLifecycle(payload, options);
    default:
      return {
        valid: false,
        errors: [
          {
            path: 'eventType',
            message: `Unknown canonical event type '${eventType}'. Expected one of: 'subscription_state_change', 'customer_transaction', 'ad_spend', 'product_telemetry', 'crm_lifecycle'`,
            code: 'UNKNOWN_EVENT_TYPE',
          },
        ],
      };
  }
}
