/** This connector's own plugin id — matches the `id:` in {@link STRIPE_PLUGIN_MANIFEST_YAML} below. */
export const STRIPE_PLUGIN_ID = 'com.growthos.stripe';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'stripe'` and whose secret (KAN-29) is the JSON blob {@link StripeCredentialSecret} (`credential-secret.ts`) describes. */
export const STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'stripe_credential_attachment_id';

/**
 * The built-in Stripe plugin's own `plugin.yaml` (KAN-49, plan `13 §E8.1`).
 * Registered through the exact same org-scoped Plugin Registry flow
 * (KAN-46) any third-party manifest uses — an org admin pastes this text
 * (or uses the registry page's "Use Stripe template" shortcut) rather than
 * this connector being special-cased into the generic registry/install
 * machinery. `scopes` covers exactly what the connector does: land records
 * (`ingest:write`) and self-provision its own commerce schemas
 * (`schema:write`, see `ensureStripeCommerceSchemasRegistered`) — no OAuth
 * connect-flow scope, since this connector authenticates with a Stripe
 * *secret key* the org owner supplies via the Resource Library vault, not a
 * Stripe Connect OAuth grant (a real Connect integration needs Stripe to
 * approve a platform application first, the same human-gated-approval
 * shape KAN-43 already tracks for Google/Meta — out of scope until a human
 * pursues that application).
 */
export const STRIPE_PLUGIN_MANIFEST_YAML = `
id: ${STRIPE_PLUGIN_ID}
version: 1.0.0
type: source
display_name: Stripe
scopes: [ingest:write, schema:write]
config_schema:
  ${STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
registers:
  entities: [stripe_subscription]
  events: [stripe_charge, stripe_invoice, stripe_refund, stripe_failed_payment]
endpoints:
  sync: ./sync.ts
`.trim();
