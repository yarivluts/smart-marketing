/** This built-in pack's own plugin id — matches the `id:` in {@link SUPPORT_PACK_MANIFEST_YAML} below. */
export const SUPPORT_PACK_PLUGIN_ID = 'com.growthos.support-pack';

/**
 * The built-in Customer Support pack's own `plugin.yaml` (KAN-90, plan
 * `14 §Gap 6`). Registered through the exact same org-scoped Plugin
 * Registry flow (KAN-46) any third-party manifest uses, mirroring the
 * Experiment pack's manifest posture exactly: `type: metric_pack`, no
 * `endpoints`/`config_schema` (this pack only registers the
 * `support_ticket_event` schema plus its own aggregation/formula metrics —
 * no sync/run concept, no per-install credential; a real Zendesk/Intercom/
 * Freshdesk/Crisp connector is deferred, same posture Stripe/GA4/KAN-82/
 * KAN-84/KAN-87 established for their own third-party connectors). `scopes`
 * covers `metrics:write` and `schema:write`.
 */
export const SUPPORT_PACK_MANIFEST_YAML = `
id: ${SUPPORT_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Customer Support
scopes: [metrics:write, schema:write]
registers:
  metrics: [support_tickets_opened, support_tickets_resolved, support_avg_first_response_seconds, support_avg_resolution_seconds, support_avg_csat_score, support_open_backlog]
`.trim();
