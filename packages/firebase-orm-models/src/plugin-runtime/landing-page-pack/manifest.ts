/** This built-in pack's own plugin id — matches the `id:` in {@link LANDING_PAGE_PACK_MANIFEST_YAML} below. */
export const LANDING_PAGE_PACK_PLUGIN_ID = 'com.growthos.landing-page-pack';

/**
 * The built-in Landing Page Performance pack's own `plugin.yaml`. Registered
 * through the same org-scoped Plugin Registry flow (KAN-46) any third-party
 * manifest uses, mirroring the SaaS/Engagement packs' posture exactly:
 * `type: metric_pack`, no `endpoints`/`config_schema` (it only registers
 * metric definitions and seeds one board — no sync/run concept, no
 * per-install credential).
 *
 * Its metrics read `fact_landing_page_performance`, which is produced by the
 * existing touchpoint capture (KAN-57) and attribution (KAN-58) pipeline —
 * so a project already sending touchpoints gets a populated board with no
 * new instrumentation and, notably, without waiting on any ad-platform API
 * approval.
 */
export const LANDING_PAGE_PACK_MANIFEST_YAML = `
id: ${LANDING_PAGE_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Landing Page Performance
scopes: [metrics:write]
registers:
  metrics: [lp_visitors, lp_conversions, lp_conversion_rate]
`.trim();
