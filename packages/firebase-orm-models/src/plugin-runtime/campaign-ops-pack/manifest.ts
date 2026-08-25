/** This built-in pack's own plugin id — matches the `id:` in {@link CAMPAIGN_OPS_PACK_MANIFEST_YAML} below. */
export const CAMPAIGN_OPS_PACK_PLUGIN_ID = 'com.growthos.campaign-ops-pack';

/**
 * The built-in Campaign Ops pack's own `plugin.yaml` (KAN-86, plan `14 §Gap
 * 12`). Same "registers metrics, nothing to sync" shape as the Engagement
 * pack: no `endpoints`/`config_schema`. Its metrics target
 * `fact_customer_payback` and `fact_quality_calibration`, dbt marts built
 * purely from tables (`events`, `fact_revenue_event`,
 * `fact_signup_quality_score`, `fact_attribution`) every project already
 * has once landed. `scopes` gained `schema:write` (2026-08-25 follow-up,
 * mirroring `quality-score-pack`'s own manifest doc comment for the
 * identical reason): `index.ts` now idempotently ensures the SaaS pack's
 * own `ad_spend` measure schema exists, since the new `roi_Nd` formulas
 * reference that pack's `ad_spend` aggregation by name — `ad_spend` itself
 * is deliberately omitted from `registers.metrics` below, the same
 * "reused, not owned" convention `quality-score-pack`'s manifest already
 * establishes.
 */
export const CAMPAIGN_OPS_PACK_MANIFEST_YAML = `
id: ${CAMPAIGN_OPS_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Campaign Ops
scopes: [metrics:write, schema:write]
registers:
  metrics: [collection_7d, collection_14d, collection_30d, collection_40d, roi_7d, roi_14d, roi_30d, roi_40d, quality_calibration_signups, quality_calibration_paying_signups, quality_calibration_collected_revenue_40d, quality_calibration_paying_rate, quality_calibration_avg_collected_revenue_40d]
`.trim();
