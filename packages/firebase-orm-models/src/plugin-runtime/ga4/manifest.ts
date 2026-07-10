/** This connector's own plugin id — matches the `id:` in {@link GA4_PLUGIN_MANIFEST_YAML} below. */
export const GA4_PLUGIN_ID = 'com.growthos.ga4';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'ga4'` and whose secret (KAN-29) is the JSON blob {@link Ga4CredentialSecret} (`credential-secret.ts`) describes. */
export const GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'ga4_credential_attachment_id';

/** The config field naming which GA4 property to query, e.g. `properties/123456789` — GA4, unlike Stripe, has no single-account-per-secret shape, so the property is its own explicit config field rather than being implied by the credential. */
export const GA4_PROPERTY_ID_CONFIG_FIELD = 'ga4_property_id';

/**
 * The built-in GA4 plugin's own `plugin.yaml` (KAN-52, plan `13 §E8.4`).
 * Registered through the exact same org-scoped Plugin Registry flow
 * (KAN-46) any third-party manifest uses. `scopes` covers exactly what the
 * connector does: land records (`ingest:write`) and self-provision its own
 * schemas (`schema:write`, see `ensureGa4SchemasRegistered`) — no OAuth
 * connect-flow scope, since this connector authenticates with a bearer
 * access token the org owner supplies via the Resource Library vault, not a
 * live Google OAuth consent-screen grant (a real one needs Google to
 * approve an OAuth app first, the same human-gated-approval shape KAN-43
 * already tracks for Google Ads/Meta — out of scope until a human pursues
 * that application; unlike Google Ads, GA4 itself doesn't require a
 * separate developer-token approval, so this connector doesn't carry
 * KAN-43's `blocked-by`, only its own OAuth-app-review gap).
 */
export const GA4_PLUGIN_MANIFEST_YAML = `
id: ${GA4_PLUGIN_ID}
version: 1.0.0
type: source
display_name: Google Analytics 4
scopes: [ingest:write, schema:write]
config_schema:
  ${GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
  ${GA4_PROPERTY_ID_CONFIG_FIELD}: { type: string, required: true }
registers:
  events: [ga4_session, ga4_event]
endpoints:
  sync: ./sync.ts
`.trim();
