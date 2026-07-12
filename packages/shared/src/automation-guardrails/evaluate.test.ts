import { describe, expect, it } from 'vitest';
import { evaluateBudgetChangeGuardrails } from './evaluate';
import type { AutomationGuardrailPolicy } from './types';

const PERMISSIVE_POLICY: AutomationGuardrailPolicy = {
  maxDailyBudgetChangePct: null,
  spendCeilingUsd: null,
  protectedTargetIds: [],
  allowedHours: null,
  maxActionsPerDay: null,
};

const NOON_UTC = new Date('2026-07-12T12:00:00.000Z');

describe('evaluateBudgetChangeGuardrails', () => {
  it('allows a simulated budget change when every guardrail is satisfied', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, maxDailyBudgetChangePct: 25, spendCeilingUsd: 500, allowedHours: { startHourUtc: 9, endHourUtc: 17 }, maxActionsPerDay: 10 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 110 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 2 },
    );
    expect(violations).toEqual([]);
  });

  it('blocks a simulated budget change that exceeds the max daily change percentage', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, maxDailyBudgetChangePct: 20 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 200 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 0 },
    );
    expect(violations).toEqual([expect.objectContaining({ type: 'max_daily_change_pct' })]);
  });

  it('treats a change off a zero budget as an unbounded percentage change', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, maxDailyBudgetChangePct: 20 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 0, afterDailyBudgetUsd: 50 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 0 },
    );
    expect(violations).toEqual([expect.objectContaining({ type: 'max_daily_change_pct' })]);
  });

  it('does not flag a same-zero-budget no-op change as a percentage violation', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, maxDailyBudgetChangePct: 20 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 0, afterDailyBudgetUsd: 0 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 0 },
    );
    expect(violations).toEqual([]);
  });

  it('blocks a simulated budget change that exceeds the absolute spend ceiling', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, spendCeilingUsd: 150 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 200 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 0 },
    );
    expect(violations).toEqual([expect.objectContaining({ type: 'spend_ceiling' })]);
  });

  it('blocks a simulated budget change targeting a protected campaign', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, protectedTargetIds: ['campaign-1'] },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 105 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 0 },
    );
    expect(violations).toEqual([expect.objectContaining({ type: 'protected_target' })]);
  });

  it('blocks a simulated budget change proposed outside the allowed hours window', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, allowedHours: { startHourUtc: 9, endHourUtc: 17 } },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 105 },
      { nowUtc: new Date('2026-07-12T03:00:00.000Z'), actionsExecutedToday: 0 },
    );
    expect(violations).toEqual([expect.objectContaining({ type: 'outside_allowed_hours' })]);
  });

  it('allows an allowed-hours window that wraps past midnight UTC', () => {
    const policy: AutomationGuardrailPolicy = { ...PERMISSIVE_POLICY, allowedHours: { startHourUtc: 22, endHourUtc: 6 } };
    const change: import('./types').ProposedBudgetChange = { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 105 };

    expect(evaluateBudgetChangeGuardrails(policy, change, { nowUtc: new Date('2026-07-12T23:00:00.000Z'), actionsExecutedToday: 0 })).toEqual([]);
    expect(evaluateBudgetChangeGuardrails(policy, change, { nowUtc: new Date('2026-07-12T12:00:00.000Z'), actionsExecutedToday: 0 })).toEqual([
      expect.objectContaining({ type: 'outside_allowed_hours' }),
    ]);
  });

  it('blocks a simulated budget change once the daily blast-radius limit is reached', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, maxActionsPerDay: 5 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 105 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 5 },
    );
    expect(violations).toEqual([expect.objectContaining({ type: 'blast_radius' })]);
  });

  it('reports every violated guardrail at once, not just the first', () => {
    const violations = evaluateBudgetChangeGuardrails(
      { ...PERMISSIVE_POLICY, protectedTargetIds: ['campaign-1'], spendCeilingUsd: 150 },
      { targetId: 'campaign-1', beforeDailyBudgetUsd: 100, afterDailyBudgetUsd: 200 },
      { nowUtc: NOON_UTC, actionsExecutedToday: 0 },
    );
    expect(violations.map((v) => v.type).sort()).toEqual(['protected_target', 'spend_ceiling']);
  });
});
