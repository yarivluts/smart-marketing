/** This built-in pack's own plugin id — matches the `id:` in {@link QUALITY_SCORE_PACK_MANIFEST_YAML} below. */
export const QUALITY_SCORE_PACK_PLUGIN_ID = 'com.growthos.quality-score-pack';

/**
 * The built-in Intent & Quality Scoring pack's own `plugin.yaml` (KAN-83,
 * plan `14 §Gap 4`). Registered through the exact same org-scoped Plugin
 * Registry flow (KAN-46) any third-party manifest uses, mirroring the
 * Feedback & NPS / Churn Reason packs' posture exactly: `type: metric_pack`,
 * no `endpoints`/`config_schema` (this pack only registers a schema plus
 * metric definitions — no sync/run concept, no per-install credential).
 * `scopes` covers `metrics:write` and `schema:write` for the same reason
 * those two packs' own manifest doc comments give: it self-provisions the
 * `onboarding_survey` event schema this pack's own `fact_signup_quality_score`
 * dbt mart is built from (`schemas.ts` — which also, idempotently, ensures
 * the SaaS pack's own `ad_spend` measure schema exists, since two of this
 * pack's own formula metrics reference that pack's `ad_spend` aggregation by
 * name; `ad_spend` itself is deliberately omitted from `registers.metrics`
 * below — it's a *reused* metric this pack depends on, idempotently
 * registered only when the SaaS pack hasn't already, not one this pack
 * defines).
 */
export const QUALITY_SCORE_PACK_MANIFEST_YAML = `
id: ${QUALITY_SCORE_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Intent & Quality Scoring
scopes: [metrics:write, schema:write]
registers:
  metrics: [signup_quality_score_sum, signups_scored, paying_signup_quality_score_sum, paying_signups_scored, avg_signup_quality_score, quality_weighted_signups, quality_weighted_new_paying, quality_adjusted_cost_per_signup, quality_adjusted_cac]
`.trim();
