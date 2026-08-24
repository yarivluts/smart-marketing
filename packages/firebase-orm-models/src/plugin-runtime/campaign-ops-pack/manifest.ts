/** This built-in pack's own plugin id — matches the `id:` in {@link CAMPAIGN_OPS_PACK_MANIFEST_YAML} below. */
export const CAMPAIGN_OPS_PACK_PLUGIN_ID = 'com.growthos.campaign-ops-pack';

/**
 * The built-in Campaign Ops pack's own `plugin.yaml` (KAN-86, plan `14 §Gap
 * 12`). Same "registers metrics, nothing to sync" shape as the Engagement
 * pack: no `endpoints`/`config_schema`, and no `schema:write` scope either —
 * unlike the SaaS/Feedback/Churn Reason packs, this one self-provisions no
 * event schema of its own; its metrics target `fact_customer_payback` and
 * `fact_quality_calibration`, dbt marts built purely from tables (`events`,
 * `fact_revenue_event`, `fact_signup_quality_score`) every project already
 * has once landed.
 */
export const CAMPAIGN_OPS_PACK_MANIFEST_YAML = `
id: ${CAMPAIGN_OPS_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Campaign Ops
scopes: [metrics:write]
registers:
  metrics: [collection_7d, collection_14d, collection_30d, collection_40d, quality_calibration_signups, quality_calibration_paying_signups, quality_calibration_collected_revenue_40d, quality_calibration_paying_rate, quality_calibration_avg_collected_revenue_40d]
`.trim();
