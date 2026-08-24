/** This built-in pack's own plugin id — matches the `id:` in {@link REP_COLLECTIONS_PACK_MANIFEST_YAML} below. */
export const REP_COLLECTIONS_PACK_PLUGIN_ID = 'com.growthos.rep-collections-pack';

/**
 * The built-in Rep Collections pack's own `plugin.yaml` (KAN-88, plan
 * `14 §Gap 13`). Same "registers metrics, nothing to sync" shape as the
 * Campaign Ops pack: no `endpoints`/`config_schema`, and no `schema:write`
 * scope either — this pack self-provisions no event schema of its own; its
 * one metric targets `fact_revenue_event`, a dbt mart every project already
 * has once landed (the same table the SaaS pack's own `collected_revenue`
 * targets, just with a `customer_id` breakdown that metric doesn't declare
 * — see `rep-collections.service.ts`'s doc comment on why this is a new
 * metric in a new pack rather than an evolution of that one).
 */
export const REP_COLLECTIONS_PACK_MANIFEST_YAML = `
id: ${REP_COLLECTIONS_PACK_PLUGIN_ID}
version: 1.0.0
type: metric_pack
display_name: Rep Collections
scopes: [metrics:write]
registers:
  metrics: [collected_revenue_by_customer]
`.trim();
