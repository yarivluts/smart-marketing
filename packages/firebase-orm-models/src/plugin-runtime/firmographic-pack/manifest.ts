/** This built-in pack's own plugin id — matches the `id:` in {@link FIRMOGRAPHIC_PACK_MANIFEST_YAML} below. */
export const FIRMOGRAPHIC_PACK_PLUGIN_ID = 'com.growthos.firmographic-enrichment-pack';

/**
 * The built-in Firmographic Enrichment pack's own `plugin.yaml` (KAN-87,
 * plan `14 §Gap 11`). Registered through the exact same org-scoped Plugin
 * Registry flow (KAN-46) any third-party manifest uses, mirroring the
 * Churn Reason pack's manifest posture exactly: `type: metric_pack`, no
 * `endpoints`/`config_schema` (this pack only registers a schema plus two
 * dimension-breakdown metrics — no sync/run concept, no per-install
 * credential; a real third-party enrichment connector, e.g. Clearbit, needs
 * a human-provisioned API key, same posture Stripe/GA4 established, and is
 * deferred — see `firmographic.service.ts`'s own doc comment). `scopes`
 * covers `metrics:write` and `schema:write` for the same reason the Churn
 * Reason pack's own manifest doc comment gives: it self-provisions the
 * `company_firmographic` event schema this pack's own
 * `fact_company_firmographic` dbt mart is built from.
 */
export const FIRMOGRAPHIC_PACK_MANIFEST_YAML = `
id: ${FIRMOGRAPHIC_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Firmographic Enrichment
scopes: [metrics:write, schema:write]
registers:
  metrics: [firmographic_profiles_total, firmographic_mrr_total]
`.trim();
