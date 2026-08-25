import { describe, expect, it } from 'vitest';
import {
  isSegmentEventConditionKind,
  isSegmentFilterOperator,
  isValidSegmentEventCondition,
  isValidSegmentFilterCondition,
  SEGMENT_EVENT_CONDITION_KINDS,
  SEGMENT_FILTER_OPERATORS,
} from './segment-filter';

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

  it('rejects a field name that is not a safe identifier (segment.service.ts compiles it straight into a SQL/JSON-key expression)', () => {
    expect(isValidSegmentFilterCondition({ field: "plan'; DROP TABLE entities; --", op: '=', value: 'pro' })).toBe(false);
    expect(isValidSegmentFilterCondition({ field: 'properties.nested', op: '=', value: 'pro' })).toBe(false);
    expect(isValidSegmentFilterCondition({ field: '1plan', op: '=', value: 'pro' })).toBe(false);
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

describe('isSegmentEventConditionKind', () => {
  it.each(SEGMENT_EVENT_CONDITION_KINDS)('accepts "%s"', (kind) => {
    expect(isSegmentEventConditionKind(kind)).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isSegmentEventConditionKind('sometimes_event')).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isSegmentEventConditionKind(1)).toBe(false);
  });
});

describe('isValidSegmentEventCondition', () => {
  it('accepts a bare "no_event" condition (the KAN-93 "paying_no_demo" case)', () => {
    expect(isValidSegmentEventCondition({ kind: 'no_event', schemaName: 'demo_event' })).toBe(true);
  });

  it('accepts a "has_event" condition with a lookback window', () => {
    expect(isValidSegmentEventCondition({ kind: 'has_event', schemaName: 'support_ticket_event', withinDays: 30 })).toBe(true);
  });

  it('accepts a condition with nested field filters', () => {
    expect(
      isValidSegmentEventCondition({
        kind: 'has_event',
        schemaName: 'demo_event',
        filters: [{ field: 'stage', op: '=', value: 'held' }],
      }),
    ).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isValidSegmentEventCondition({ kind: 'sometimes_event', schemaName: 'demo_event' })).toBe(false);
  });

  it('rejects a missing/empty schemaName', () => {
    expect(isValidSegmentEventCondition({ kind: 'no_event' })).toBe(false);
    expect(isValidSegmentEventCondition({ kind: 'no_event', schemaName: '  ' })).toBe(false);
  });

  it('rejects a non-array filters value', () => {
    expect(isValidSegmentEventCondition({ kind: 'no_event', schemaName: 'demo_event', filters: 'nope' })).toBe(false);
  });

  it('rejects a malformed nested filter', () => {
    expect(
      isValidSegmentEventCondition({ kind: 'no_event', schemaName: 'demo_event', filters: [{ field: 'stage', op: 'like', value: 'held' }] }),
    ).toBe(false);
  });

  it('rejects a zero, negative, or non-integer withinDays', () => {
    expect(isValidSegmentEventCondition({ kind: 'no_event', schemaName: 'demo_event', withinDays: 0 })).toBe(false);
    expect(isValidSegmentEventCondition({ kind: 'no_event', schemaName: 'demo_event', withinDays: -5 })).toBe(false);
    expect(isValidSegmentEventCondition({ kind: 'no_event', schemaName: 'demo_event', withinDays: 2.5 })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isValidSegmentEventCondition('not an object')).toBe(false);
    expect(isValidSegmentEventCondition(null)).toBe(false);
  });
});
