import { MetricCompilerError } from '@growthos/shared';
import type { MetricQueryRequest } from '@growthos/shared';
import { ProjectNotFoundError } from './resource-library.service';
import { queryMetrics } from './metrics-query.service';
import { MetricNotRegisteredError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { WarehouseNotConfiguredError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import type { MetricQueryResultCache } from '../warehouse/result-cache';

/**
 * KAN-66's trial-pipeline war-room widget (E12.2b, `14` gap 14: "in trial
 * now -> converting at X%") — a fixed 2-metric query against the KAN-59 SaaS
 * pack's `trials_active`/`trial_conversion_rate` (see that pack's `metrics.ts`
 * for their definitions), summed the same way `board-view.ts`'s
 * `buildBigNumberView` collapses a bucketed series into one number. This is a
 * project-level widget, not a board tile — there's no tile config to read a
 * date range/compare/dimensions from, so it always queries a fixed trailing
 * window, the exact same 30-day default `defaultDateRange()`
 * (`board.service.ts`) picks for a brand-new board — unlike a histogram
 * tile's already-collapsed single-snapshot source, `trials_active`/
 * `trial_conversion_rate` are ongoing per-day aggregations, so a recent
 * trailing window (not `HISTOGRAM_TIME_RANGE_FLOOR`'s all-time floor) is the
 * right default here.
 */
const TRIAL_PIPELINE_WINDOW_DAYS = 30;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function trailingWindow(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

export type TrialPipelineOutcome =
  | { ok: true; series: WarehouseRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

export interface GetTrialPipelineSummaryParams {
  organizationId: string;
  projectId: string;
  /** Defaults to {@link defaultWarehouseQueryExecutor} — overridable so tests can inject a fake executor without a real warehouse. */
  executor?: WarehouseQueryExecutor;
  /** Defaults to {@link defaultMetricQueryResultCache} — overridable per-call for the same reason as `executor`. */
  cache?: MetricQueryResultCache;
}

/**
 * Resolves + runs the trial-pipeline widget's own metric query, degrading to
 * a structured outcome instead of throwing — the exact same three-reason
 * shape `queryBoardTile` (`board.service.ts`) already established for "a
 * tile couldn't load", reused here since the failure modes are identical
 * (no warehouse configured yet, the project's daily quota is spent, or the
 * request/catalog itself is invalid — e.g. the SaaS pack was never
 * installed in this project, so `trials_active`/`trial_conversion_rate`
 * aren't registered).
 */
export async function getTrialPipelineSummary(params: GetTrialPipelineSummaryParams): Promise<TrialPipelineOutcome> {
  const request: MetricQueryRequest = {
    metrics: ['trials_active', 'trial_conversion_rate'],
    time: { ...trailingWindow(TRIAL_PIPELINE_WINDOW_DAYS), grain: 'day' },
  };

  try {
    const result = await queryMetrics({
      organizationId: params.organizationId,
      projectId: params.projectId,
      request,
      ...(params.executor ? { executor: params.executor } : {}),
      ...(params.cache ? { cache: params.cache } : {}),
    });
    return { ok: true, series: result.series };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    // See `queryBoardTile`'s own doc comment on why an unrecognized error
    // rethrows instead of degrading silently.
    if (error instanceof MetricCompilerError || error instanceof ProjectNotFoundError || error instanceof MetricNotRegisteredError) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}
