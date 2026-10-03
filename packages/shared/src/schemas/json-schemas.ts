import type { CanonicalEventType } from './types';
import { SUBSCRIPTION_STATE_CHANGE_JSON_SCHEMA } from './subscription-state-change';
import { CUSTOMER_TRANSACTION_JSON_SCHEMA } from './customer-transaction';
import { AD_SPEND_JSON_SCHEMA } from './ad-spend';
import { PRODUCT_TELEMETRY_JSON_SCHEMA } from './product-telemetry';
import { CRM_LIFECYCLE_JSON_SCHEMA } from './crm-lifecycle';

export const CANONICAL_JSON_SCHEMAS: Record<CanonicalEventType, Record<string, unknown>> = {
  subscription_state_change: SUBSCRIPTION_STATE_CHANGE_JSON_SCHEMA,
  customer_transaction: CUSTOMER_TRANSACTION_JSON_SCHEMA,
  ad_spend: AD_SPEND_JSON_SCHEMA,
  product_telemetry: PRODUCT_TELEMETRY_JSON_SCHEMA,
  crm_lifecycle: CRM_LIFECYCLE_JSON_SCHEMA,
};

/**
 * Returns the Draft-07 JSON Schema for the specified canonical event type.
 */
export function getCanonicalJsonSchema(eventType: CanonicalEventType): Record<string, unknown> {
  const schema = CANONICAL_JSON_SCHEMAS[eventType];
  if (!schema) {
    throw new Error(`No JSON Schema registered for event type: ${eventType}`);
  }
  return schema;
}
