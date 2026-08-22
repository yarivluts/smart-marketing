import { describe, expect, it } from 'vitest';
import { proposeSegmentSuggestions } from './suggest';

describe('proposeSegmentSuggestions', () => {
  it('proposes a churn_risk suggestion for a boolean field with an exact keyword token', () => {
    const suggestions = proposeSegmentSuggestions('stripe_subscription', [{ name: 'cancel_at_period_end', type: 'boolean' }]);

    expect(suggestions).toEqual([
      {
        schemaName: 'stripe_subscription',
        field: 'cancel_at_period_end',
        category: 'churn_risk',
        filters: [{ field: 'cancel_at_period_end', op: '=', value: true }],
        confidence: 1,
      },
    ]);
  });

  it('proposes payment_risk, trial, and vip suggestions from their own keyword tokens', () => {
    const suggestions = proposeSegmentSuggestions('customer', [
      { name: 'is_delinquent', type: 'boolean' },
      { name: 'is_trial', type: 'boolean' },
      { name: 'is_vip', type: 'boolean' },
    ]);

    expect(suggestions.map((s) => s.category).sort()).toEqual(['payment_risk', 'trial', 'vip']);
    suggestions.forEach((s) => expect(s.confidence).toBe(1));
  });

  it('matches a long keyword as a substring of the normalized field name', () => {
    const suggestions = proposeSegmentSuggestions('customer', [{ name: 'high_value_flag', type: 'boolean' }]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ category: 'vip', confidence: 0.7 });
  });

  it('ignores non-boolean fields even when their name matches a keyword', () => {
    const suggestions = proposeSegmentSuggestions('customer', [
      { name: 'cancel_reason', type: 'string' },
      { name: 'trial_days_remaining', type: 'number' },
    ]);

    expect(suggestions).toEqual([]);
  });

  it('drops a boolean field whose name matches no known category', () => {
    const suggestions = proposeSegmentSuggestions('customer', [{ name: 'is_active', type: 'boolean' }]);

    expect(suggestions).toEqual([]);
  });

  it('proposes two independent suggestions when two fields both signal the same category', () => {
    const suggestions = proposeSegmentSuggestions('customer', [
      { name: 'is_canceled', type: 'boolean' },
      { name: 'cancel_at_period_end', type: 'boolean' },
    ]);

    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.category === 'churn_risk')).toBe(true);
  });

  it('sorts by confidence descending, ties broken alphabetically by field name', () => {
    const suggestions = proposeSegmentSuggestions('customer', [
      { name: 'high_value_flag', type: 'boolean' },
      { name: 'is_vip', type: 'boolean' },
      { name: 'is_trial', type: 'boolean' },
    ]);

    expect(suggestions.map((s) => s.field)).toEqual(['is_trial', 'is_vip', 'high_value_flag']);
  });

  it('respects a custom minConfidence, excluding substring-only matches when raised above 0.7', () => {
    const suggestions = proposeSegmentSuggestions('customer', [{ name: 'high_value_flag', type: 'boolean' }], 0.8);

    expect(suggestions).toEqual([]);
  });
});
