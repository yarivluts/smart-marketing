import type { MetricDefinitionInput } from '../../services/metric-registry.service';

export interface FirmographicPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * The Firmographic Enrichment pack's two metrics (KAN-87, plan `14 §Gap
 * 11`), sharing the same `dimensions` so a caller can query both against
 * the identical `industry`/`employee_count_range`/`region` breakdown for
 * the AC's "composition dashboards (# vs $)": `firmographic_profiles_total`
 * is the "#" axis (plain row count — a `count`, not `count_distinct`: every
 * landed profile counts once, even a customer who re-submits an updated
 * profile over time), `firmographic_mrr_total` is the "$" axis (`sum` of
 * `fact_company_firmographic.mrr`, joined in from the customer's current
 * subscription — null for a profile with no subscription, `sum` skips
 * nulls the same way every other `sum`-shaped metric in this codebase
 * already relies on). Both target `fact_company_firmographic` — a new dbt
 * core mart (`packages/dbt-transform/dbt/models/core/
 * fact_company_firmographic.sql`) that flattens a `company_firmographic`
 * event's self-reported/classified fields into real columns. `dimensions`
 * here must exactly match real columns on that mart (the compiler has no
 * schema-level validation for a dimension name — see `saas-metric-pack/
 * saas-metric-pack.emulator.test.ts`'s own regression comment on this class
 * of bug).
 */
const FIRMOGRAPHIC_PROFILES_TOTAL: FirmographicPackMetricDefinition = {
  name: 'firmographic_profiles_total',
  dimensions: ['industry', 'employee_count_range', 'region'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_company_firmographic',
      timeColumn: 'ts',
      filters: [],
    },
  },
};

const FIRMOGRAPHIC_MRR_TOTAL: FirmographicPackMetricDefinition = {
  name: 'firmographic_mrr_total',
  dimensions: ['industry', 'employee_count_range', 'region'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_company_firmographic',
      column: 'mrr',
      timeColumn: 'ts',
      filters: [],
    },
  },
};

export const FIRMOGRAPHIC_PACK_METRICS: readonly FirmographicPackMetricDefinition[] = [FIRMOGRAPHIC_PROFILES_TOTAL, FIRMOGRAPHIC_MRR_TOTAL];
