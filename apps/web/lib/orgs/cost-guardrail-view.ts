import type { ProjectCostQuota, ProjectQueryQuotaStatus, QueryCostLogEntryModel, QueryCostLogOutcome } from '@growthos/firebase-orm-models';

/**
 * A plain, serializable projection of a project's effective cost-guardrail
 * quota (KAN-39). Client components can only ever receive plain data across
 * the RSC boundary, never an `@arbel/firebase-orm` model instance — same
 * reasoning as `toOrchestrationRunView`.
 */
export interface ProjectCostQuotaView {
  dailyQueryLimit: number;
  labels: Record<string, string>;
  setAt: string | null;
}

export function toProjectCostQuotaView(quota: ProjectCostQuota): ProjectCostQuotaView {
  return { dailyQueryLimit: quota.dailyQueryLimit, labels: quota.labels, setAt: quota.setAt };
}

export interface QueryCostLogEntryView {
  id: string;
  outcome: QueryCostLogOutcome;
  definitionRefs: Record<string, string>;
  executedAt: string;
  estimatedCostUsd: number | null;
}

export function toQueryCostLogEntryView(entry: QueryCostLogEntryModel): QueryCostLogEntryView {
  return {
    id: entry.id,
    outcome: entry.outcome,
    definitionRefs: entry.definition_refs,
    executedAt: entry.executed_at,
    estimatedCostUsd: entry.estimated_cost_usd ?? null,
  };
}

/** The `CostGuardrails` translation key for one cost-log entry's outcome label. */
const OUTCOME_LABEL_KEYS: Record<QueryCostLogOutcome, 'outcomeExecuted' | 'outcomeBlockedQuotaExceeded' | 'outcomeWarehouseNotConfigured'> = {
  executed: 'outcomeExecuted',
  blocked_quota_exceeded: 'outcomeBlockedQuotaExceeded',
  warehouse_not_configured: 'outcomeWarehouseNotConfigured',
};

export function outcomeLabelKey(
  outcome: QueryCostLogOutcome,
): 'outcomeExecuted' | 'outcomeBlockedQuotaExceeded' | 'outcomeWarehouseNotConfigured' {
  return OUTCOME_LABEL_KEYS[outcome];
}

export function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

/**
 * Parses the quota form's free-form `key=value` per-line labels input into a
 * record, skipping blank lines. Malformed lines (no `=`) are dropped rather
 * than rejected — labels are purely descriptive metadata (see
 * `ProjectCostQuotaModel`'s own doc comment), so a typo here shouldn't block
 * the whole quota update the way an invalid `dailyQueryLimit` does.
 */
export function parseLabelsInput(input: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      labels[key] = value;
    }
  }
  return labels;
}

export type { ProjectQueryQuotaStatus };
