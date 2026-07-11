/** This built-in pack's own plugin id — matches the `id:` in {@link ENGAGEMENT_PACK_MANIFEST_YAML} below. */
export const ENGAGEMENT_PACK_PLUGIN_ID = 'com.growthos.engagement-pack';

/**
 * The built-in Engagement pack's own `plugin.yaml` (KAN-63, plan `13 §E11.5`
 * / `14` gap 2). Registered through the exact same org-scoped Plugin
 * Registry flow (KAN-46) any third-party manifest uses — an org admin pastes
 * this text — mirroring `SAAS_METRIC_PACK_MANIFEST_YAML`'s own posture
 * exactly: `type: metric_pack`, no `endpoints`/`config_schema` (this pack
 * only registers metric definitions, no sync/run concept and no per-install
 * credential).
 */
export const ENGAGEMENT_PACK_MANIFEST_YAML = `
id: ${ENGAGEMENT_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Engagement Pack
scopes: [metrics:write]
registers:
  metrics: [dau, wau, mau, dau_mau_ratio, engagement_depth_histogram]
`.trim();
