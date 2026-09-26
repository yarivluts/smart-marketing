import { TOUCHPOINT_SCHEMA_NAME } from '../touchpoint-capture/touchpoint-schema';
import type { SetupRecordKind, SetupRequirementId } from './types';

/**
 * Which requirement one schema's records count towards, decided from its kind and name alone.
 *
 * Schema names are the project's own (EasySign sends "signup" and "document_created", the Stripe
 * connector "stripe_invoice"), so this matches on words in the name rather than on a fixed list.
 * Whole tokens only for the short words: "document_created" must not read as a signup just
 * because it ends in "created" (the funnel-stage heuristic's "created" keyword would do exactly
 * that), and "reorder" must not read as billing because it contains "order".
 */

function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const BILLING_TOKENS = new Set([
  'billing',
  'subscription',
  'subscriptions',
  'invoice',
  'invoices',
  'payment',
  'payments',
  'charge',
  'charges',
  'refund',
  'refunds',
  'purchase',
  'purchases',
  'purchased',
  'paid',
  'order',
  'orders',
  'transaction',
  'transactions',
  'mrr',
  'revenue',
]);

const SIGNUP_TOKENS = new Set(['signup', 'signups', 'register', 'registered', 'registration']);
/** Multi-word forms, matched against the separator-free name ("sign_up" -> "signup", "accountCreated" -> "accountcreated"). */
const SIGNUP_PHRASES = ['signup', 'signedup', 'accountcreated', 'usercreated', 'userregistered'];

const SPEND_TOKENS = new Set(['spend', 'adspend']);

function isBillingName(name: string): boolean {
  return tokenize(name).some((token) => BILLING_TOKENS.has(token)) || normalize(name).includes('subscription');
}

function isSignupName(name: string): boolean {
  const normalized = normalize(name);
  return tokenize(name).some((token) => SIGNUP_TOKENS.has(token)) || SIGNUP_PHRASES.some((phrase) => normalized.includes(phrase));
}

function isSpendName(name: string): boolean {
  return tokenize(name).some((token) => SPEND_TOKENS.has(token)) || normalize(name) === 'adspend';
}

/** `null` for a schema no requirement is about (e.g. an unrelated measure), or a nameless record (a malformed envelope). */
export function classifySchemaForSetupRequirement(kind: SetupRecordKind, schemaName: string): SetupRequirementId | null {
  if (schemaName.trim().length === 0) {
    return null;
  }
  if (kind === 'event') {
    if (schemaName === TOUCHPOINT_SCHEMA_NAME) return 'landing_page_attribution';
    if (isBillingName(schemaName)) return 'billing';
    if (isSignupName(schemaName)) return 'signups';
    return 'product_usage';
  }
  if (kind === 'entity') {
    return isBillingName(schemaName) ? 'billing' : 'customer_profiles';
  }
  if (isSpendName(schemaName)) return 'ad_spend';
  if (isBillingName(schemaName)) return 'billing';
  return null;
}
