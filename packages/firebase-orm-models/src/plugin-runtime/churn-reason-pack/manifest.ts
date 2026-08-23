/** This built-in pack's own plugin id — matches the `id:` in {@link CHURN_REASON_PACK_MANIFEST_YAML} below. */
export const CHURN_REASON_PACK_PLUGIN_ID = 'com.growthos.churn-reason-pack';

/**
 * The built-in Churn Reasons pack's own `plugin.yaml` (KAN-84, plan `14
 * §Gap 10`). Registered through the exact same org-scoped Plugin Registry
 * flow (KAN-46) any third-party manifest uses, mirroring the Feedback & NPS
 * pack's own posture exactly: `type: metric_pack`, no `endpoints`/
 * `config_schema` (this pack only registers a schema plus one metric — no
 * sync/run concept, no per-install credential). `scopes` covers
 * `metrics:write` and `schema:write` for the same reason the Feedback pack's
 * own manifest doc comment gives: it self-provisions the `churn_reason`
 * event schema its own metric's `fact_churn_reason` dbt mart is built from
 * (`schemas.ts`).
 */
export const CHURN_REASON_PACK_MANIFEST_YAML = `
id: ${CHURN_REASON_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Churn Reasons
scopes: [metrics:write, schema:write]
registers:
  metrics: [churn_events]
`.trim();
