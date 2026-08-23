/** This built-in pack's own plugin id — matches the `id:` in {@link FEEDBACK_PACK_MANIFEST_YAML} below. */
export const FEEDBACK_PACK_PLUGIN_ID = 'com.growthos.feedback-pack';

/**
 * The built-in Feedback & NPS pack's own `plugin.yaml` (KAN-82, plan `14
 * §Gap 1`). Registered through the exact same org-scoped Plugin Registry
 * flow (KAN-46) any third-party manifest uses, mirroring the SaaS metric
 * pack's posture exactly: `type: metric_pack`, no `endpoints`/
 * `config_schema` (this pack only registers a schema plus metric
 * definitions — no sync/run concept, no per-install credential). `scopes`
 * covers `metrics:write` and `schema:write` for the same reason the SaaS
 * pack's own manifest doc comment gives: it self-provisions the
 * `survey_response` event schema its own metrics' `fact_survey_response`
 * dbt mart is built from (`schemas.ts`).
 */
export const FEEDBACK_PACK_MANIFEST_YAML = `
id: ${FEEDBACK_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Feedback & NPS
scopes: [metrics:write, schema:write]
registers:
  metrics: [nps_respondents, nps_promoters, nps_detractors, nps_score]
`.trim();
