import type { OrchestrationFreshnessTable } from '../models/orchestration-run.model';

/** One table's freshness snapshot, as an executor reports it back — camelCase, independent of the persisted model's own snake_case field names (same split as `WarehouseRow`/`MetricCatalogEntry` elsewhere in this package). */
export interface OrchestrationFreshnessEntry {
  table: OrchestrationFreshnessTable;
  rowCount: number;
  latestRecordAt: string | null;
}

export interface OrchestrationExecutionResult {
  freshness: OrchestrationFreshnessEntry[];
}

export interface OrchestrationExecutorRunParams {
  organizationId: string;
  projectId: string;
}

/**
 * Actually runs one orchestration pass for a project and reports back the
 * freshness metadata it produced — the seam `orchestration.service.ts`'s
 * `triggerOrchestrationRun` calls, kept provider-agnostic so a real
 * Dagster/Cloud Workflows-driven executor can slot in later (once KAN-18
 * provisions somewhere to run one) without `triggerOrchestrationRun` or the
 * `OrchestrationRunModel` shape changing — the same "buildable today, swap
 * the provider later" split `LocalKmsProvider` (KAN-29),
 * `InMemoryTokenBucketRateLimiter` (KAN-34), and
 * `NotConfiguredWarehouseQueryExecutor` (KAN-42) already established for
 * their own infrastructure seams.
 */
export interface OrchestrationExecutor {
  run(params: OrchestrationExecutorRunParams): Promise<OrchestrationExecutionResult>;
}

/** Thrown by an {@link OrchestrationExecutor} when a run fails — carries a human-readable reason, persisted verbatim as `OrchestrationRunModel.error_message`. */
export class OrchestrationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrchestrationExecutionError';
  }
}
