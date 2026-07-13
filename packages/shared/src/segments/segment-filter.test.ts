import { describe, expect, it } from 'vitest';
import { isSegmentFilterOperator, isValidSegmentFilterCondition, SEGMENT_FILTER_OPERATORS } from './segment-filter';

describe('isSegmentFilterOperator', () => {
  it.each(SEGMENT_FILTER_OPERATORS)('accepts "%s"', (op) => {
    expect(isSegmentFilterOperator(op)).toBe(true);
  });

  it('rejects an unknown operator', () => {
    expect(isSegmentFilterOperator('like')).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isSegmentFilterOperator(1)).toBe(false);
  });
});

describe('isValidSegmentFilterCondition', () => {
  it('accepts a well-shaped condition with a string value', () => {
    expect(isValidSegmentFilterCondition({ field: 'plan', op: '=', value: 'pro' })).toBe(true);
  });

  it('accepts a numeric value', () => {
    expect(isValidSegmentFilterCondition({ field: 'mrr_usd', op: '>', value: 200 })).toBe(true);
  });

  it('accepts a boolean value', () => {
    expect(isValidSegmentFilterCondition({ field: 'is_trial', op: '=', value: false })).toBe(true);
  });

  it('rejects a missing field', () => {
    expect(isValidSegmentFilterCondition({ op: '=', value: 'pro' })).toBe(false);
  });

  it('rejects an empty/whitespace-only field', () => {
    expect(isValidSegmentFilterCondition({ field: '  ', op: '=', value: 'pro' })).toBe(false);
  });

  it('rejects an unknown operator', () => {
    expect(isValidSegmentFilterCondition({ field: 'plan', op: 'like', value: 'pro' })).toBe(false);
  });

  it('rejects a non-primitive value', () => {
    expect(isValidSegmentFilterCondition({ field: 'plan', op: '=', value: { nested: true } })).toBe(false);
  });

  it('rejects a null value', () => {
    expect(isValidSegmentFilterCondition({ field: 'plan', op: '=', value: null })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isValidSegmentFilterCondition('not an object')).toBe(false);
    expect(isValidSegmentFilterCondition(null)).toBe(false);
  });
});
