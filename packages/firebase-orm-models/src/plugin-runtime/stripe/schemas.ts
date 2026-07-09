import type { SchemaFieldInput } from '../../services/schema-registry.service';
import {
  DuplicateSchemaDefinitionError,
  registerSchemaDefinition,
} from '../../services/schema-registry.service';

/** Event schema names this connector lands (plan `13 §E8.1`: "charges, invoices, subscriptions, refunds, failed payments"). */
export const STRIPE_CHARGE_EVENT_NAME = 'stripe_charge';
export const STRIPE_INVOICE_EVENT_NAME = 'stripe_invoice';
export const STRIPE_REFUND_EVENT_NAME = 'stripe_refund';
export const STRIPE_FAILED_PAYMENT_EVENT_NAME = 'stripe_failed_payment';
/** Entity schema name — a subscription is current-state (status, `mrr_normalized`, etc.), not an append-only fact, per plan `09 §2`'s `dim_subscription`. */
export const STRIPE_SUBSCRIPTION_ENTITY_NAME = 'stripe_subscription';

const CHARGE_FIELDS: SchemaFieldInput[] = [
  { name: 'charge_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'customer_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: true },
  { name: 'amount', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'currency', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'status', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'refunded', type: 'boolean', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'amount_refunded', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
];

const INVOICE_FIELDS: SchemaFieldInput[] = [
  { name: 'invoice_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'customer_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: true },
  { name: 'subscription_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: true },
  { name: 'status', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'amount_due', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'amount_paid', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'currency', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
];

const REFUND_FIELDS: SchemaFieldInput[] = [
  { name: 'refund_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'charge_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'amount', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'currency', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'status', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'reason', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

const FAILED_PAYMENT_FIELDS: SchemaFieldInput[] = [
  { name: 'charge_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'customer_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: true },
  { name: 'amount', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'currency', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'failure_code', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'failure_message', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

const SUBSCRIPTION_FIELDS: SchemaFieldInput[] = [
  { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'status', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'currency', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'mrr_normalized', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'current_period_end', type: 'timestamp', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'cancel_at_period_end', type: 'boolean', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'canceled_at', type: 'timestamp', isRequired: false, isPii: false, isIdentityKey: false },
];

/** `(kind, name, fields)` for every schema this connector needs — the single source of truth {@link ensureStripeCommerceSchemasRegistered} registers from. */
export const STRIPE_COMMERCE_SCHEMAS: readonly { kind: 'event' | 'entity'; name: string; fields: SchemaFieldInput[] }[] = [
  { kind: 'event', name: STRIPE_CHARGE_EVENT_NAME, fields: CHARGE_FIELDS },
  { kind: 'event', name: STRIPE_INVOICE_EVENT_NAME, fields: INVOICE_FIELDS },
  { kind: 'event', name: STRIPE_REFUND_EVENT_NAME, fields: REFUND_FIELDS },
  { kind: 'event', name: STRIPE_FAILED_PAYMENT_EVENT_NAME, fields: FAILED_PAYMENT_FIELDS },
  { kind: 'entity', name: STRIPE_SUBSCRIPTION_ENTITY_NAME, fields: SUBSCRIPTION_FIELDS },
];

/**
 * Idempotently registers every commerce schema this connector lands into
 * (KAN-49, plan `13 §E8.1`: "-> commerce schemas"), so a project installing
 * the Stripe plugin doesn't need an admin to hand-register five schemas
 * before its first sync/webhook can land anything. Registering is the only
 * side effect a plugin's own runtime performs on the generic schema
 * registry — deliberately scoped to this one connector's own schema names,
 * not a generic "plugins can register schemas" mechanism.
 *
 * Safe to call on every run/webhook: `registerSchemaDefinition` throwing
 * {@link DuplicateSchemaDefinitionError} just means a prior call (or a human,
 * via the Schema Registry admin page) already registered this family —
 * silently skipped, not an error. A human is free to `evolveSchemaDefinition`
 * one of these families afterward (e.g. to add a field); this function never
 * re-registers or overwrites an existing version.
 */
export async function ensureStripeCommerceSchemasRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<void> {
  await Promise.all(
    STRIPE_COMMERCE_SCHEMAS.map(async ({ kind, name, fields }) => {
      try {
        await registerSchemaDefinition({ organizationId, projectId, kind, name, fields, createdByUserId });
      } catch (error) {
        if (error instanceof DuplicateSchemaDefinitionError) {
          return;
        }
        throw error;
      }
    }),
  );
}
