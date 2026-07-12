export interface AutomationBudgetChangeExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  beforeDailyBudgetUsd: number;
  afterDailyBudgetUsd: number;
}

export interface AutomationBudgetChangeExecutionResult {
  actualDailyBudgetUsd: number;
}

/**
 * The seam KAN-72/KAN-73 (Google Ads / Meta Manage-tier plugins) implement
 * against for real — `executeBudgetChange` applies a proposed change to the
 * live ad platform, `rollbackBudgetChange` restores the pre-action value.
 * Same "provider-agnostic executor interface" posture as
 * `SourcePluginExecutor` (KAN-47) and `WarehouseQueryExecutor` (KAN-42).
 */
export interface AutomationActionExecutor {
  executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
}
