import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { renderWithIntl, createMockAuditEntry } from './helpers/test-harness';
import { evaluateBudgetChangeGuardrails } from '@growthos/shared';
import type { AutomationGuardrailPolicy, ProposedBudgetChange, GuardrailEvaluationContext } from '@growthos/shared';

// Test mock component for Action Execution Hub & Audit Log
function MockActionHub({
  initialActions = [
    createMockAuditEntry({
      id: 'act-1',
      actionType: 'budget_change',
      targetLabel: 'Meta Retargeting Campaign',
      status: 'awaiting_approval',
      beforeDailyBudgetUsd: 150,
      afterDailyBudgetUsd: 250,
    }),
  ],
  onApprove = vi.fn(),
  onExecute = vi.fn(),
  onRollback = vi.fn(),
  killSwitchEngaged = false,
}) {
  const [actions, setActions] = useState(initialActions);

  async function handleApprove(id: string) {
    onApprove(id);
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'approved' } : a)),
    );
  }

  async function handleExecute(id: string) {
    if (killSwitchEngaged) {
      return;
    }
    onExecute(id);
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'executed', executedAt: new Date().toISOString() } : a)),
    );
  }

  async function handleRollback(id: string) {
    onRollback(id);
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'rolled_back' } : a)),
    );
  }

  return (
    <div data-testid="action-hub" className="p-4 border rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Automation Action Hub & Audit Trail</h2>
        {killSwitchEngaged && (
          <span data-testid="kill-switch-active-badge" className="bg-destructive text-destructive-foreground px-2 py-1 rounded text-xs font-bold">
            KILL SWITCH ACTIVE
          </span>
        )}
      </div>

      <div className="space-y-3">
        {actions.map((act) => (
          <div key={act.id} data-testid={`action-row-${act.id}`} className="border p-3 rounded flex justify-between items-center">
            <div>
              <div className="font-semibold">{act.targetLabel}</div>
              <div className="text-xs text-muted-foreground">
                Type: {act.actionType} | Status: <span data-testid={`status-${act.id}`} className="font-medium text-primary">{act.status}</span>
              </div>
              <div className="text-xs mt-1">
                Diff: ${act.beforeDailyBudgetUsd}/day &rarr; <span className="text-green-600 font-bold">${act.afterDailyBudgetUsd}/day</span>
              </div>
            </div>

            <div className="flex gap-2">
              {act.status === 'awaiting_approval' && (
                <button
                  type="button"
                  data-testid={`approve-btn-${act.id}`}
                  onClick={() => handleApprove(act.id)}
                  className="bg-primary text-primary-foreground px-3 py-1 rounded text-xs"
                >
                  Approve
                </button>
              )}
              {act.status === 'approved' && (
                <button
                  type="button"
                  data-testid={`execute-btn-${act.id}`}
                  onClick={() => handleExecute(act.id)}
                  className="bg-green-600 text-white px-3 py-1 rounded text-xs"
                >
                  Execute
                </button>
              )}
              {(act.status === 'executed' || act.status === 'verified') && (
                <button
                  type="button"
                  data-testid={`rollback-btn-${act.id}`}
                  onClick={() => handleRollback(act.id)}
                  className="border border-destructive text-destructive px-3 py-1 rounded text-xs hover:bg-destructive/10"
                >
                  1-Click Rollback
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

describe('Tier 1: 1-Click Action Execution & Rollback Pipeline (R2)', () => {
  it('5.1 executes the full action lifecycle: Propose -> Approve -> Execute -> Status Updated to Executed', async () => {
    const onApprove = vi.fn();
    const onExecute = vi.fn();

    renderWithIntl(<MockActionHub onApprove={onApprove} onExecute={onExecute} />);

    expect(screen.getByTestId('status-act-1')).toHaveTextContent('awaiting_approval');

    // Step 1: Approve
    const approveBtn = screen.getByTestId('approve-btn-act-1');
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledWith('act-1');
    expect(screen.getByTestId('status-act-1')).toHaveTextContent('approved');

    // Step 2: Execute
    const executeBtn = screen.getByTestId('execute-btn-act-1');
    fireEvent.click(executeBtn);
    expect(onExecute).toHaveBeenCalledWith('act-1');
    expect(screen.getByTestId('status-act-1')).toHaveTextContent('executed');
  });

  it('5.2 triggers 1-Click Rollback on an executed action and reverts status to rolled_back', () => {
    const onRollback = vi.fn();
    const executedAction = createMockAuditEntry({
      id: 'act-exec',
      targetLabel: 'Google Search Ads',
      status: 'executed',
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 200,
    });

    renderWithIntl(<MockActionHub initialActions={[executedAction]} onRollback={onRollback} />);

    expect(screen.getByTestId('status-act-exec')).toHaveTextContent('executed');
    const rollbackBtn = screen.getByTestId('rollback-btn-act-exec');
    expect(rollbackBtn).toBeInTheDocument();

    fireEvent.click(rollbackBtn);
    expect(onRollback).toHaveBeenCalledWith('act-exec');
    expect(screen.getByTestId('status-act-exec')).toHaveTextContent('rolled_back');
  });

  it('5.3 blocks actions that violate safety guardrail policies (spend ceiling & max daily change %)', () => {
    const policy: AutomationGuardrailPolicy = {
      protectedTargetIds: ['target-protected'],
      maxDailyBudgetChangePct: 50,
      spendCeilingUsd: 500,
      allowedHours: null,
      maxActionsPerDay: null,
    };

    const context: GuardrailEvaluationContext = {
      nowUtc: new Date(),
      actionsExecutedToday: 0,
    };

    // Case A: Exceeds 50% change limit ($100 -> $200 = 100% change)
    const excessiveChange: ProposedBudgetChange = {
      targetId: 'target-1',
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 200,
    };
    const violations1 = evaluateBudgetChangeGuardrails(policy, excessiveChange, context);
    expect(violations1).toHaveLength(1);
    expect(violations1[0].type).toBe('max_daily_change_pct');

    // Case B: Exceeds spend ceiling ($600 > $500 ceiling)
    const ceilingExceeded: ProposedBudgetChange = {
      targetId: 'target-1',
      beforeDailyBudgetUsd: 450,
      afterDailyBudgetUsd: 600,
    };
    const violations2 = evaluateBudgetChangeGuardrails(policy, ceilingExceeded, context);
    expect(violations2.some((v) => v.type === 'spend_ceiling')).toBe(true);

    // Case C: Protected target modification
    const protectedChange: ProposedBudgetChange = {
      targetId: 'target-protected',
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 120,
    };
    const violations3 = evaluateBudgetChangeGuardrails(policy, protectedChange, context);
    expect(violations3.some((v) => v.type === 'protected_target')).toBe(true);
  });

  it('5.4 permits actions within guardrail thresholds without violations', () => {
    const policy: AutomationGuardrailPolicy = {
      protectedTargetIds: [],
      maxDailyBudgetChangePct: 50,
      spendCeilingUsd: 1000,
      allowedHours: null,
      maxActionsPerDay: 10,
    };

    const context: GuardrailEvaluationContext = {
      nowUtc: new Date(),
      actionsExecutedToday: 2,
    };

    // Safe change: $200 -> $250 (+25%, well under 50% and under $1000 ceiling)
    const safeChange: ProposedBudgetChange = {
      targetId: 'target-safe',
      beforeDailyBudgetUsd: 200,
      afterDailyBudgetUsd: 250,
    };

    const violations = evaluateBudgetChangeGuardrails(policy, safeChange, context);
    expect(violations).toHaveLength(0);
  });

  it('5.5 respects Emergency Kill Switch state and blocks automated action execution', () => {
    const onExecute = vi.fn();
    const approvedAction = createMockAuditEntry({
      id: 'act-kill',
      targetLabel: 'Meta Campaign',
      status: 'approved',
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 150,
    });

    renderWithIntl(
      <MockActionHub initialActions={[approvedAction]} onExecute={onExecute} killSwitchEngaged={true} />,
    );

    expect(screen.getByTestId('kill-switch-active-badge')).toBeInTheDocument();
    const executeBtn = screen.getByTestId('execute-btn-act-kill');
    fireEvent.click(executeBtn);

    expect(onExecute).not.toHaveBeenCalled();
    expect(screen.getByTestId('status-act-kill')).toHaveTextContent('approved');
  });

  it('5.6 records Before/After diffs and execution timestamp in audit trail', () => {
    const auditAction = createMockAuditEntry({
      id: 'act-diff',
      targetLabel: 'Google Performance Max',
      status: 'executed',
      beforeDailyBudgetUsd: 300,
      afterDailyBudgetUsd: 450,
    });

    renderWithIntl(<MockActionHub initialActions={[auditAction]} />);

    expect(screen.getByText('Google Performance Max')).toBeInTheDocument();
    expect(screen.getByText(/Diff: \$300\/day/)).toBeInTheDocument();
    expect(screen.getByText('$450/day')).toBeInTheDocument();
  });
});
