import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { AutomationTargetNotFoundError } from '../services/automation-errors';
import type { AutomationActionExecutor, AutomationBudgetChangeExecutionInput, AutomationBudgetChangeExecutionResult } from './executor';

async function loadTarget(input: AutomationBudgetChangeExecutionInput): Promise<AutomationTargetStateModel> {
  const target = await AutomationTargetStateModel.init(input.targetId, {
    organization_id: input.organizationId,
    project_id: input.projectId,
  });
  if (!target) {
    throw new AutomationTargetNotFoundError(input.targetId);
  }
  return target;
}

/**
 * The buildable-today stand-in `AutomationActionExecutor` — mutates
 * {@link AutomationTargetStateModel} (this codebase's simulated "live ad
 * platform state") instead of calling a real ad platform API, the same
 * "actually works against a real stand-in" posture `LocalDbtOrchestrationExecutor`
 * (KAN-38) established rather than `NotConfiguredWarehouseQueryExecutor`'s
 * (KAN-42) pure no-op — so KAN-71's execute -> verify -> rollback pipeline has
 * something real to prove out end to end (the "rollback restores prior
 * state" AC) before KAN-72/KAN-73 exist.
 */
export class SimulatedAdAccountExecutor implements AutomationActionExecutor {
  async executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: target.daily_budget_usd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    target.daily_budget_usd = input.beforeDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: target.daily_budget_usd };
  }
}

export const defaultAutomationActionExecutor: AutomationActionExecutor = new SimulatedAdAccountExecutor();
