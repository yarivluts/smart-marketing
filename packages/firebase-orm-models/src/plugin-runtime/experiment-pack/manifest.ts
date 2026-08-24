/** This built-in pack's own plugin id — matches the `id:` in {@link EXPERIMENT_PACK_MANIFEST_YAML} below. */
export const EXPERIMENT_PACK_PLUGIN_ID = 'com.growthos.experiment-pack';

/**
 * The built-in Experiment pack's own `plugin.yaml` (KAN-89, plan `14
 * §Gap 3`). Registered through the exact same org-scoped Plugin Registry
 * flow (KAN-46) any third-party manifest uses, mirroring the Churn Reason
 * pack's manifest posture exactly: `type: metric_pack`, no `endpoints`/
 * `config_schema` (this pack only registers two event schemas plus two
 * aggregation metrics — no sync/run concept, no per-install credential).
 * `scopes` covers `metrics:write` and `schema:write`: it self-provisions
 * the `experiment_exposure`/`experiment_conversion` event schemas this
 * pack's own `fact_experiment_event` dbt mart is built from (`index.ts`).
 */
export const EXPERIMENT_PACK_MANIFEST_YAML = `
id: ${EXPERIMENT_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Experiments
scopes: [metrics:write, schema:write]
registers:
  metrics: [experiment_exposures, experiment_conversions]
`.trim();
