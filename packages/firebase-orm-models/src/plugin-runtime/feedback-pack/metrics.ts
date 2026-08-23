import type { MetricDefinitionInput } from '../../services/metric-registry.service';

/**
 * The NPS metric pack (KAN-82, plan `14 §Gap 1`: "NPS metric pack (score,
 * trend, ...)"), mirroring the SaaS metric pack's own two-phase
 * aggregation-then-formula registration convention
 * (`saas-metric-pack/metrics.ts`). Targets `fact_survey_response` — a new
 * dbt core mart (`packages/dbt-transform/dbt/models/core/
 * fact_survey_response.sql`) that flattens a `survey_response` event's JSON
 * `properties.score`/`properties.survey_type` into real columns, since the
 * metrics compiler only ever emits bare column references against a mart's
 * own flat columns (see `fact_funnel_event`'s own `step` column for the
 * established precedent — no generic JSON-payload extraction exists at
 * query time). `nps_respondents`/`nps_promoters`/`nps_detractors` are
 * `count`-function aggregations (a plain row count, not `count_distinct`) —
 * every landed NPS response counts once, even a customer who responds more
 * than once over time (this pack tracks response volume/score, not
 * per-customer sentiment). `nps_score` is a formula composed from the
 * other three so it always reflects the exact same underlying row set a
 * human inspecting the other three metrics would see.
 */
export interface FeedbackPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

const NPS_RESPONDENTS: FeedbackPackMetricDefinition = {
  name: 'nps_respondents',
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_survey_response',
      timeColumn: 'ts',
      filters: [{ field: 'survey_type', operator: '=', value: 'nps' }],
    },
  },
};

const NPS_PROMOTERS: FeedbackPackMetricDefinition = {
  name: 'nps_promoters',
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_survey_response',
      timeColumn: 'ts',
      filters: [
        { field: 'survey_type', operator: '=', value: 'nps' },
        { field: 'score', operator: '>=', value: '9' },
      ],
    },
  },
};

const NPS_DETRACTORS: FeedbackPackMetricDefinition = {
  name: 'nps_detractors',
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_survey_response',
      timeColumn: 'ts',
      filters: [
        { field: 'survey_type', operator: '=', value: 'nps' },
        { field: 'score', operator: '<=', value: '6' },
      ],
    },
  },
};

/** `(promoters - detractors) / respondents * 100` — the standard NPS formula, expressed over this pack's own aggregation metrics so it always reconciles with them. */
const NPS_SCORE: FeedbackPackMetricDefinition = {
  name: 'nps_score',
  dimensions: [],
  definition: { kind: 'formula', formula: '(nps_promoters - nps_detractors) / nps_respondents * 100' },
};

export const FEEDBACK_PACK_METRICS: readonly FeedbackPackMetricDefinition[] = [
  NPS_RESPONDENTS,
  NPS_PROMOTERS,
  NPS_DETRACTORS,
  NPS_SCORE,
];
