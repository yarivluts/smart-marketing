import { describe, expect, it } from 'vitest';
import { evaluateWinRuleFilters, isWinRuleFilterOperator, WIN_RULE_FILTER_OPERATORS } from './index';

describe('evaluateWinRuleFilters', () => {
  it('matches unconditionally when there are no filters', () => {
    expect(evaluateWinRuleFilters({ anything: 'goes' }, [])).toBe(true);
  });

  it('matches a numeric > filter against a top-level field', () => {
    const filters = [{ field: 'amount', operator: '>' as const, value: '100' }];
    expect(evaluateWinRuleFilters({ amount: 150 }, filters)).toBe(true);
    expect(evaluateWinRuleFilters({ amount: 50 }, filters)).toBe(false);
    expect(evaluateWinRuleFilters({ amount: 100 }, filters)).toBe(false);
  });

  it('matches a numeric >= filter against a nested field', () => {
    const filters = [{ field: 'data.object.amount_total', operator: '>=' as const, value: '4999' }];
    expect(evaluateWinRuleFilters({ data: { object: { amount_total: 4999 } } }, filters)).toBe(true);
    expect(evaluateWinRuleFilters({ data: { object: { amount_total: 4998 } } }, filters)).toBe(false);
  });

  it('coerces a numeric-looking string payload value before comparing', () => {
    const filters = [{ field: 'amount', operator: '<' as const, value: '100' }];
    expect(evaluateWinRuleFilters({ amount: '50' }, filters)).toBe(true);
  });

  it('supports string equality for non-numeric fields', () => {
    const filters = [{ field: 'plan', operator: '=' as const, value: 'enterprise' }];
    expect(evaluateWinRuleFilters({ plan: 'enterprise' }, filters)).toBe(true);
    expect(evaluateWinRuleFilters({ plan: 'starter' }, filters)).toBe(false);
  });

  it('supports string inequality for non-numeric fields', () => {
    const filters = [{ field: 'plan', operator: '!=' as const, value: 'starter' }];
    expect(evaluateWinRuleFilters({ plan: 'enterprise' }, filters)).toBe(true);
    expect(evaluateWinRuleFilters({ plan: 'starter' }, filters)).toBe(false);
  });

  it('never matches a relational operator against a non-numeric field', () => {
    const filters = [{ field: 'plan', operator: '>' as const, value: 'enterprise' }];
    expect(evaluateWinRuleFilters({ plan: 'starter' }, filters)).toBe(false);
  });

  it('does not match when the filter field is missing from the payload', () => {
    const filters = [{ field: 'amount', operator: '>' as const, value: '100' }];
    expect(evaluateWinRuleFilters({}, filters)).toBe(false);
  });

  it('requires every filter to match (AND semantics)', () => {
    const filters = [
      { field: 'amount', operator: '>' as const, value: '100' },
      { field: 'plan', operator: '=' as const, value: 'enterprise' },
    ];
    expect(evaluateWinRuleFilters({ amount: 150, plan: 'enterprise' }, filters)).toBe(true);
    expect(evaluateWinRuleFilters({ amount: 150, plan: 'starter' }, filters)).toBe(false);
    expect(evaluateWinRuleFilters({ amount: 50, plan: 'enterprise' }, filters)).toBe(false);
  });
});

describe('isWinRuleFilterOperator', () => {
  it('accepts every declared operator', () => {
    for (const operator of WIN_RULE_FILTER_OPERATORS) {
      expect(isWinRuleFilterOperator(operator)).toBe(true);
    }
  });

  it('rejects an unknown operator', () => {
    expect(isWinRuleFilterOperator('in')).toBe(false);
    expect(isWinRuleFilterOperator('~=')).toBe(false);
  });
});
