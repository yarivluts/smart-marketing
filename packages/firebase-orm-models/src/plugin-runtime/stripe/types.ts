/**
 * Minimal Stripe REST API shapes (KAN-49, plan `13 §E8.1`) — only the
 * fields this connector actually reads, not a full mirror of Stripe's API.
 * Kept independent of the `stripe` npm SDK (not a dependency of this
 * package) so the connector stays a small, provider-agnostic-interface
 * consumer of plain JSON, the same "buildable today, swap the provider
 * later" posture `WarehouseQueryExecutor`/`KmsProvider` already established
 * for their own external-system seams.
 */

/** A Stripe list endpoint's envelope — every `GET /v1/...` list response shares this shape. */
export interface StripeListPage<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
}

export const STRIPE_CHARGE_STATUSES = ['succeeded', 'pending', 'failed'] as const;
export type StripeChargeStatus = (typeof STRIPE_CHARGE_STATUSES)[number];

export interface StripeCharge {
  id: string;
  object: 'charge';
  amount: number;
  currency: string;
  customer: string | null;
  status: StripeChargeStatus;
  refunded: boolean;
  amount_refunded: number;
  created: number;
  failure_code?: string | null;
  failure_message?: string | null;
}

export const STRIPE_INVOICE_STATUSES = ['draft', 'open', 'paid', 'uncollectible', 'void'] as const;
export type StripeInvoiceStatus = (typeof STRIPE_INVOICE_STATUSES)[number];

export interface StripeInvoice {
  id: string;
  object: 'invoice';
  customer: string | null;
  subscription: string | null;
  status: StripeInvoiceStatus;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
}

export const STRIPE_REFUND_STATUSES = ['succeeded', 'pending', 'failed', 'canceled'] as const;
export type StripeRefundStatus = (typeof STRIPE_REFUND_STATUSES)[number];

export interface StripeRefund {
  id: string;
  object: 'refund';
  charge: string;
  amount: number;
  currency: string;
  status: StripeRefundStatus;
  reason: string | null;
  created: number;
}

export const STRIPE_SUBSCRIPTION_INTERVALS = ['day', 'week', 'month', 'year'] as const;
export type StripeSubscriptionInterval = (typeof STRIPE_SUBSCRIPTION_INTERVALS)[number];

export interface StripeSubscriptionItem {
  price: {
    unit_amount: number;
    currency: string;
    recurring: {
      interval: StripeSubscriptionInterval;
      interval_count: number;
    };
  };
  quantity: number;
}

export const STRIPE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;
export type StripeSubscriptionStatus = (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

export interface StripeSubscription {
  id: string;
  object: 'subscription';
  customer: string;
  status: StripeSubscriptionStatus;
  currency: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  created: number;
  items: { data: StripeSubscriptionItem[] };
}

/** A verified Stripe webhook event envelope (`Stripe-Signature` already checked by the time this is read). */
export interface StripeWebhookEvent {
  id: string;
  object: 'event';
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}
