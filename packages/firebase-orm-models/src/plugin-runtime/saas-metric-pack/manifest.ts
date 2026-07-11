/** This built-in pack's own plugin id — matches the `id:` in {@link SAAS_METRIC_PACK_MANIFEST_YAML} below. */
export const SAAS_METRIC_PACK_PLUGIN_ID = 'com.growthos.saas-marketing-metrics';

/**
 * The built-in SaaS/marketing metric-pack's own `plugin.yaml` (KAN-59, plan
 * `13 §E11.1`, formulas from `04 §2`; KAN-66/`14` gap 14 added the trailing
 * three win-catalog/trial-pipeline metrics). Registered through the exact
 * same org-scoped Plugin Registry flow (KAN-46) any third-party manifest
 * uses — an org admin pastes this text — rather than this pack being
 * special-cased into the generic registry machinery.
 *
 * `type: metric_pack` (unlike Stripe/GA4's `type: source`): this pack has no
 * sync/webhook endpoint and lands no raw records — it only registers metric
 * definitions against the canonical warehouse tables (plan `04 §1`), so
 * `endpoints` is omitted and `scopes` covers exactly `metrics:write`. No
 * `config_schema` either: unlike a source connector, this pack needs no
 * per-install credential to register config-only metric definitions.
 */
export const SAAS_METRIC_PACK_MANIFEST_YAML = `
id: ${SAAS_METRIC_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: SaaS & Marketing Metrics
scopes: [metrics:write]
registers:
  metrics: [ad_spend, signups, cost_per_signup, cac, conversion_to_paying, mrr, mrr_movements, net_mrr_churn, troi, collected_revenue, failed_charge_rate, reactivations, trials_active, trial_conversion_rate]
`.trim();
