/** This built-in pack's own plugin id — matches the `id:` in {@link SALES_PACK_MANIFEST_YAML} below. */
export const SALES_PACK_PLUGIN_ID = 'com.growthos.sales-pack';

/**
 * The built-in Sales Pipeline pack's own `plugin.yaml` (KAN-92, plan `14
 * §Gap 9`: "demo/meeting events in the SaaS pack"). Registered through the
 * exact same org-scoped Plugin Registry flow (KAN-46) any third-party
 * manifest uses, mirroring the Customer Support pack's manifest posture
 * exactly: `type: metric_pack`, no `endpoints`/`config_schema` (this pack
 * only registers the `demo_event` schema plus its own aggregation/formula
 * metrics — no sync/run concept, no per-install credential; a real
 * calendar/CRM connector is deferred, same posture Stripe/GA4/KAN-82/
 * KAN-84/KAN-87/KAN-90 established for their own third-party connectors).
 * `scopes` covers `metrics:write` and `schema:write`.
 */
export const SALES_PACK_MANIFEST_YAML = `
id: ${SALES_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Sales Pipeline
scopes: [metrics:write, schema:write]
registers:
  metrics: [demos_scheduled, demos_held, demos_no_show, demo_show_rate]
`.trim();
