import type { MetricDefinitionInput } from '../../services/metric-registry.service';

/**
 * One metric this pack registers. `featured` marks the eleven names KAN-59's
 * own AC lists by name (`ad_spend`, `signups`, `cost_per_signup`, `cac`,
 * `conversion_to_paying`, `mrr`, `mrr_movements`, `net_mrr_churn`, `troi`,
 * `collected_revenue`, `failed_charge_rate`); the rest are supporting
 * aggregations a formula-kind featured metric depends on (plan `04 §2`'s own
 * examples lean on the same kind of intermediate metric — e.g. `ltv_to_cac`
 * needs `ltv`, which needs `arpa`/`gross_margin`/`revenue_churn_rate`, none
 * of which are "the ask" either). `registerMetricDefinition` requires every
 * formula reference to already be an *active* metric at registration time
 * (`metric-registry.service.ts`), so {@link SAAS_METRIC_PACK_METRICS} is
 * ordered aggregation-kind-first, formula-kind-second — every formula below
 * only references aggregation-kind metrics from this same pack, so a single
 * two-phase registration (see `./index.ts`) is enough; no metric here needs
 * a third phase.
 *
 * Table/column names follow plan `04 §1`'s canonical warehouse schema
 * (`fact_ad_spend`, `fact_funnel_event`, `fact_revenue_event`,
 * `dim_subscription`) — the same aspirational-but-canonical convention
 * `metrics-compiler`'s `test-catalog.ts` already established, since no real
 * BigQuery warehouse exists yet (KAN-18) and `dbt-transform`'s actual core
 * tables (`entities`/`events`/`measures`) are a deliberately generalized,
 * un-normalized stand-in the compiler can't yet reach into (no join graph,
 * no JSON-column extraction — see `metrics-compiler/compiler.ts`'s own doc
 * comment). Dimensions are declared **only** when they correspond to a real
 * column on that metric's own aggregation table (plan `04 §1`'s per-table
 * column lists) — e.g. `signups`/`new_paying` (backed by `fact_funnel_event`/
 * `fact_revenue_event`, neither of which carries a `channel`-shaped column)
 * deliberately have no dimensions yet, rather than declaring a breakdown the
 * compiler can't honestly compile. Known, documented simplifications below
 * are called out per metric.
 */
export interface SaasMetricPackDefinition {
  name: string;
  featured: boolean;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

const AD_SPEND: SaasMetricPackDefinition = {
  name: 'ad_spend',
  featured: true,
  dimensions: ['channel_id', 'campaign_id', 'adset_id', 'ad_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] },
  },
};

const SIGNUPS: SaasMetricPackDefinition = {
  name: 'signups',
  featured: true,
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count_distinct',
      table: 'fact_funnel_event',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'step', operator: '=', value: 'signup' }],
    },
  },
};

/**
 * Supporting aggregation for `cac`/`conversion_to_paying` — not itself one of
 * KAN-59's eleven named metrics, same posture as `test-catalog.ts`'s
 * `new_paying`. `type='first_charge'` (plan `04 §2`'s own literal example)
 * is a narrower, distinguished sub-category of `total_charges`/`failed_
 * charges`'s `type='charge'` below — specifically a customer's *first*
 * successful charge, not every charge attempt — so the two filters
 * deliberately don't overlap 1:1; a real warehouse's `type` column would
 * need to support both values (or `first_charge` derived from `charge` +
 * a first-occurrence window) once KAN-18 lands.
 */
const NEW_PAYING: SaasMetricPackDefinition = {
  name: 'new_paying',
  featured: false,
  dimensions: ['plan'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count_distinct',
      table: 'fact_revenue_event',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'type', operator: '=', value: 'first_charge' }],
    },
  },
};

const MRR: SaasMetricPackDefinition = {
  name: 'mrr',
  featured: true,
  dimensions: ['plan'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'dim_subscription',
      column: 'mrr',
      timeColumn: 'started_at',
      filters: [{ field: 'status', operator: '=', value: 'active' }],
    },
  },
};

/**
 * Plan `04 §3` names the MRR-movement family `mrr_movement{new,expansion,
 * contraction,churn}` but KAN-59's own AC lists a single `mrr_movements`
 * name — realized here as one metric, broken down by `dim_subscription`'s
 * own `type` column (`charge` ~ new, `upgrade` ~ expansion, `downgrade` ~
 * contraction/churn — plan `04 §1`'s `fact_revenue_event` doesn't enumerate
 * a fifth, dedicated "churn" type), rather than four separate metric names.
 */
const MRR_MOVEMENTS: SaasMetricPackDefinition = {
  name: 'mrr_movements',
  featured: true,
  dimensions: ['type', 'plan'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'sum', table: 'fact_revenue_event', column: 'mrr_delta', timeColumn: 'ts', filters: [] },
  },
};

/** Supporting aggregation for `net_mrr_churn` — the `upgrade`-type slice of `mrr_movements` (see its own comment on the `type` mapping). */
const EXPANSION_MRR: SaasMetricPackDefinition = {
  name: 'expansion_mrr',
  featured: false,
  dimensions: ['plan'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_revenue_event',
      column: 'mrr_delta',
      timeColumn: 'ts',
      filters: [{ field: 'type', operator: '=', value: 'upgrade' }],
    },
  },
};

/** Supporting aggregation for `net_mrr_churn` — the `downgrade`-type slice of `mrr_movements` (see `mrr_movements`'s own comment on the `type` mapping). */
const CHURNED_MRR: SaasMetricPackDefinition = {
  name: 'churned_mrr',
  featured: false,
  dimensions: ['plan'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_revenue_event',
      column: 'mrr_delta',
      timeColumn: 'ts',
      filters: [{ field: 'type', operator: '=', value: 'downgrade' }],
    },
  },
};

const COLLECTED_REVENUE: SaasMetricPackDefinition = {
  name: 'collected_revenue',
  featured: true,
  dimensions: ['plan'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_revenue_event',
      column: 'amount',
      timeColumn: 'ts',
      filters: [{ field: 'status', operator: '=', value: 'succeeded' }],
    },
  },
};

/** Supporting aggregation for `failed_charge_rate`'s denominator — every charge attempt (`type='charge'`), success or fail; see `new_paying`'s own comment on why this is a broader category than its `type='first_charge'`. */
const TOTAL_CHARGES: SaasMetricPackDefinition = {
  name: 'total_charges',
  featured: false,
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_revenue_event',
      timeColumn: 'ts',
      filters: [{ field: 'type', operator: '=', value: 'charge' }],
    },
  },
};

/** Supporting aggregation for `failed_charge_rate`'s numerator. */
const FAILED_CHARGES: SaasMetricPackDefinition = {
  name: 'failed_charges',
  featured: false,
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_revenue_event',
      timeColumn: 'ts',
      filters: [
        { field: 'type', operator: '=', value: 'charge' },
        { field: 'status', operator: '=', value: 'failed' },
      ],
    },
  },
};

/**
 * Supporting aggregation for `troi`'s numerator. Plan `04 §2`'s own
 * `troi = attributed_gross_profit / ad_spend` needs a real gross-profit
 * figure (revenue minus margin, credited per-channel through `fact_
 * attribution`) that isn't buildable yet: `fact_attribution` (KAN-58) has no
 * dollar/margin column, only an attribution `credit` weight, and the
 * compiler has no join graph to combine it with `fact_revenue_event.amount`
 * (`metrics-compiler/compiler.ts`'s own documented limitation). Approximated
 * here as gross *revenue* (`fact_revenue_event.amount` on `charge` events)
 * until a real margin figure and a join-capable compiler exist — a known,
 * deliberately-flagged gap, not a silent shortcut.
 */
const ATTRIBUTED_GROSS_PROFIT: SaasMetricPackDefinition = {
  name: 'attributed_gross_profit',
  featured: false,
  dimensions: ['plan'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_revenue_event',
      column: 'amount',
      timeColumn: 'ts',
      filters: [{ field: 'type', operator: '=', value: 'charge' }],
    },
  },
};

const COST_PER_SIGNUP: SaasMetricPackDefinition = {
  name: 'cost_per_signup',
  featured: true,
  dimensions: [],
  definition: { kind: 'formula', formula: 'ad_spend / signups' },
};

const CAC: SaasMetricPackDefinition = {
  name: 'cac',
  featured: true,
  dimensions: [],
  definition: { kind: 'formula', formula: 'ad_spend / new_paying' },
};

const CONVERSION_TO_PAYING: SaasMetricPackDefinition = {
  name: 'conversion_to_paying',
  featured: true,
  dimensions: [],
  definition: { kind: 'formula', formula: 'new_paying / signups' },
};

/**
 * Plan `04 §2`: `net_mrr_churn = (churned_mrr - expansion_mrr) / starting_mrr`.
 * `starting_mrr` (MRR at the *start* of the requested period) isn't
 * reachable from a formula today — a formula composes other metrics' values
 * over the *same* requested period, and the compiler has no period-shifted
 * reference inside a formula body (only a whole *query's* `compare` option
 * shifts the period, per `metrics-compiler`'s `07/08` fixtures) — so this
 * uses the already-registered `mrr` metric directly as the denominator, a
 * documented approximation of "starting MRR" until formula-level period
 * shifting exists.
 */
const NET_MRR_CHURN: SaasMetricPackDefinition = {
  name: 'net_mrr_churn',
  featured: true,
  dimensions: [],
  definition: { kind: 'formula', formula: '(churned_mrr - expansion_mrr) / mrr' },
};

const TROI: SaasMetricPackDefinition = {
  name: 'troi',
  featured: true,
  dimensions: [],
  definition: { kind: 'formula', formula: 'attributed_gross_profit / ad_spend' },
};

const FAILED_CHARGE_RATE: SaasMetricPackDefinition = {
  name: 'failed_charge_rate',
  featured: true,
  dimensions: [],
  definition: { kind: 'formula', formula: 'failed_charges / total_charges' },
};

/**
 * Every metric this pack registers, aggregation-kind first so every formula
 * below only ever references an already-active metric (see this module's
 * own doc comment). Exactly eleven entries have `featured: true`, matching
 * KAN-59's AC list name-for-name.
 */
export const SAAS_METRIC_PACK_METRICS: readonly SaasMetricPackDefinition[] = [
  AD_SPEND,
  SIGNUPS,
  NEW_PAYING,
  MRR,
  MRR_MOVEMENTS,
  EXPANSION_MRR,
  CHURNED_MRR,
  COLLECTED_REVENUE,
  TOTAL_CHARGES,
  FAILED_CHARGES,
  ATTRIBUTED_GROSS_PROFIT,
  COST_PER_SIGNUP,
  CAC,
  CONVERSION_TO_PAYING,
  NET_MRR_CHURN,
  TROI,
  FAILED_CHARGE_RATE,
];

/** The eleven metric names KAN-59's own AC lists by name. */
export const SAAS_METRIC_PACK_FEATURED_METRIC_NAMES: readonly string[] = SAAS_METRIC_PACK_METRICS.filter(
  (metric) => metric.featured,
).map((metric) => metric.name);
