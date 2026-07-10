import { describe, expect, it } from 'vitest';
import { applyFieldMapping, validateMappingRules } from './engine';
import type { MappingRule, MappingRuleInput } from './types';

describe('applyFieldMapping', () => {
  const payload = {
    id: 'evt_1',
    created: 1704067200,
    data: { object: { id: 'ord_123', amount_total: 4999, currency: 'USD' } },
  };

  it('builds an event envelope from rename/cast/template/static rules', () => {
    const rules: MappingRule[] = [
      { targetField: 'event_id', transform: 'rename', sourcePath: 'id' },
      { targetField: 'event', transform: 'static', staticValue: 'order_completed' },
      { targetField: 'ts', transform: 'cast', sourcePath: 'created', castType: 'timestamp' },
      { targetField: 'properties.order_id', transform: 'rename', sourcePath: 'data.object.id' },
      { targetField: 'properties.amount', transform: 'cast', sourcePath: 'data.object.amount_total', castType: 'number' },
      {
        targetField: 'properties.summary',
        transform: 'template',
        template: '{{data.object.id}} for {{data.object.amount_total}}',
      },
    ];

    const result = applyFieldMapping(rules, payload);

    expect(result.errors).toEqual([]);
    expect(result.record).toEqual({
      event_id: 'evt_1',
      event: 'order_completed',
      ts: '2024-01-01T00:00:00.000Z',
      properties: {
        order_id: 'ord_123',
        amount: 4999,
        summary: 'ord_123 for 4999',
      },
    });
  });

  it('reports a rule whose sourcePath is missing without aborting the rest of the mapping', () => {
    const rules: MappingRule[] = [
      { targetField: 'event_id', transform: 'rename', sourcePath: 'id' },
      { targetField: 'event', transform: 'rename', sourcePath: 'does.not.exist' },
    ];

    const result = applyFieldMapping(rules, payload);

    expect(result.record).toEqual({ event_id: 'evt_1' });
    expect(result.errors).toEqual(['event:not_found:does.not.exist']);
  });

  it('reports a cast failure per-field', () => {
    const rules: MappingRule[] = [{ targetField: 'ts', transform: 'cast', sourcePath: 'data.object.currency', castType: 'number' }];
    const result = applyFieldMapping(rules, payload);
    expect(result.record).toEqual({});
    expect(result.errors).toEqual(['ts:cannot_cast_to_number']);
  });

  it('nests two container fields under the same bucket without one overwriting the other', () => {
    const rules: MappingRule[] = [
      { targetField: 'attributes.a', transform: 'static', staticValue: 'A' },
      { targetField: 'attributes.b', transform: 'static', staticValue: 'B' },
    ];
    const result = applyFieldMapping(rules, payload);
    expect(result.record).toEqual({ attributes: { a: 'A', b: 'B' } });
  });
});

describe('validateMappingRules', () => {
  const validEventRules: MappingRuleInput[] = [
    { targetField: 'event_id', transform: 'rename', sourcePath: 'id' },
    { targetField: 'event', transform: 'static', staticValue: 'order_completed' },
    { targetField: 'ts', transform: 'cast', sourcePath: 'created', castType: 'timestamp' },
  ];

  it('accepts a mapping that covers every required envelope field', () => {
    const { rules, reasons } = validateMappingRules('event', validEventRules);
    expect(reasons).toEqual([]);
    expect(rules).toHaveLength(3);
  });

  it('rejects a mapping missing a required envelope field', () => {
    const { reasons } = validateMappingRules('event', [validEventRules[0], validEventRules[1]]);
    expect(reasons).toContain('Required field "ts" has no mapping rule.');
  });

  it('rejects a target field not valid for the kind', () => {
    const { reasons } = validateMappingRules('event', [
      ...validEventRules,
      { targetField: 'attributes.nope', transform: 'static', staticValue: 'x' },
    ]);
    expect(reasons.some((reason) => reason.includes('attributes.nope'))).toBe(true);
  });

  it('rejects a duplicate target field', () => {
    const { reasons } = validateMappingRules('event', [...validEventRules, { ...validEventRules[0] }]);
    expect(reasons).toContain('Field "event_id" is mapped more than once.');
  });

  it('rejects rename/cast rules with no sourcePath', () => {
    const { reasons } = validateMappingRules('entity', [{ targetField: 'id', transform: 'rename' }]);
    expect(reasons.some((reason) => reason.includes('requires a sourcePath'))).toBe(true);
  });

  it('rejects a cast rule with an invalid castType', () => {
    const { reasons } = validateMappingRules('entity', [{ targetField: 'id', transform: 'cast', sourcePath: 'id', castType: 'not-a-type' }]);
    expect(reasons.some((reason) => reason.includes('requires a valid castType'))).toBe(true);
  });

  it('rejects a malformed sourcePath', () => {
    const { reasons } = validateMappingRules('entity', [{ targetField: 'id', transform: 'rename', sourcePath: '' }]);
    expect(reasons.some((reason) => reason.includes('requires a sourcePath'))).toBe(true);
  });

  it('rejects a template rule with an unparseable placeholder', () => {
    const { reasons } = validateMappingRules('entity', [
      { targetField: 'id', transform: 'template', template: '{{..bad}}' },
    ]);
    expect(reasons.some((reason) => reason.includes('not a valid JSONPath'))).toBe(true);
  });

  it('rejects a static rule with no staticValue', () => {
    const { reasons } = validateMappingRules('entity', [{ targetField: 'id', transform: 'static' }]);
    expect(reasons.some((reason) => reason.includes('requires a staticValue'))).toBe(true);
  });

  it('rejects an unknown transform', () => {
    const { reasons } = validateMappingRules('entity', [{ targetField: 'id', transform: 'nonsense' }]);
    expect(reasons.some((reason) => reason.includes('unknown transform'))).toBe(true);
  });

  it('rejects an empty rule list', () => {
    const { reasons } = validateMappingRules('entity', []);
    expect(reasons).toContain('A mapping must declare at least one rule.');
  });

  it('trims whitespace from targetField and sourcePath in the typed output', () => {
    const { rules, reasons } = validateMappingRules('entity', [{ targetField: '  id  ', transform: 'rename', sourcePath: '  id  ' }]);
    expect(reasons).toEqual([]);
    expect(rules[0]).toEqual({ targetField: 'id', transform: 'rename', sourcePath: 'id' });
  });

  it('never includes an explicit undefined-valued key in the typed output (Firestore rejects those, even nested in an array)', () => {
    const { rules, reasons } = validateMappingRules('entity', [{ targetField: 'id', transform: 'static', staticValue: 'x' }]);
    expect(reasons).toEqual([]);
    expect(Object.keys(rules[0]).sort()).toEqual(['staticValue', 'targetField', 'transform']);
  });
});
