import { describe, expect, it } from 'vitest';
import { formatBudget, raisedBudget } from './money';

describe('formatBudget', () => {
  it('shows the currency when it is known', () => {
    expect(formatBudget('en', 45, 'USD')).toBe('$45.00');
    expect(formatBudget('en', 45, 'ILS')).toContain('45.00');
    expect(formatBudget('en', 45, 'ILS')).toContain('₪');
  });

  it('shows the bare number without a currency, or with one that is not a code', () => {
    expect(formatBudget('en', 45.5, null)).toBe('45.5');
    expect(formatBudget('en', 1200, undefined)).toBe('1,200');
    expect(formatBudget('en', 45, 'dollars')).toBe('45');
  });
});

describe('raisedBudget', () => {
  it('suggests half as much again, whole, and always more than now', () => {
    expect(raisedBudget(20)).toBe(30);
    expect(raisedBudget(1)).toBe(2);
    expect(raisedBudget(33)).toBe(50);
  });
});
