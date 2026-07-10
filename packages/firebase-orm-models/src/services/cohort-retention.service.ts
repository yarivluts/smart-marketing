import {
  defaultCohortRetentionQueryExecutor,
  type CohortRetentionQuery,
  type CohortRetentionQueryExecutor,
  type CohortRetentionRow,
} from '../warehouse/cohort-query-executor';

export interface QueryCohortRetentionMatrixParams extends CohortRetentionQuery {
  /** Defaults to {@link defaultCohortRetentionQueryExecutor} — overridable so tests can inject a fake executor without a real warehouse. */
  executor?: CohortRetentionQueryExecutor;
}

/**
 * KAN-62's own query seam — a `heatmap` board tile's integration point,
 * mirroring `queryMetrics`'s "resolve + run through a provider-agnostic
 * executor" shape (`metrics-query.service.ts`) but against the
 * `cohort_retention` dbt core table instead of a compiled semantic-layer
 * query. Deliberately skips `queryMetrics`'s own cost-guardrail quota check
 * and result cache: this v1 has no meaningfully large query volume to guard
 * against yet (one query per heatmap tile per board render, same as every
 * other tile type before caching/quota was layered on top of them), and
 * adding either here now would be speculative infrastructure for a cost
 * this codebase hasn't observed — the same "buildable-today, not the fully
 * general mechanism" posture this codebase's other v1 stories already
 * accept (see `board-grid-editor.tsx`'s own `swapPositions` doc comment for
 * a precedent).
 */
export async function queryCohortRetentionMatrix(params: QueryCohortRetentionMatrixParams): Promise<CohortRetentionRow[]> {
  const executor = params.executor ?? defaultCohortRetentionQueryExecutor;
  return executor.execute({
    organizationId: params.organizationId,
    projectId: params.projectId,
    conversionEvent: params.conversionEvent,
    cohortMonthStart: params.cohortMonthStart,
    cohortMonthEnd: params.cohortMonthEnd,
  });
}
