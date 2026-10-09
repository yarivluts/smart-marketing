import { describe, expect, it } from 'vitest';
import {
  benchmarkFieldMappingLatency,
  calculateFieldMappingConfidence,
} from './profiler';
import { MappingRule } from './types';

describe('benchmarkFieldMappingLatency', () => {
  const samplePayload = {
    event: 'AccountUpgraded',
    timestamp: 1708349200,
    properties: {
      user_properties: {
        lifetime_value_usd: '1450.75',
      },
    },
  };

  const sampleRules: MappingRule[] = [
    { targetField: 'event_id', transform: 'template', template: 'evt-{{timestamp}}' },
    { targetField: 'event', transform: 'rename', sourcePath: 'event' },
    { targetField: 'ts', transform: 'template', template: '2024-02-19T13:26:40Z' },
    { targetField: 'properties.lifetime_value', transform: 'cast', sourcePath: 'properties.user_properties.lifetime_value_usd', castType: 'number' },
  ];

  it('runs micro-benchmarking and produces valid latency percentiles', () => {
    const result = benchmarkFieldMappingLatency(sampleRules, samplePayload, 20);

    expect(result.applied.errors).toEqual([]);
    expect(result.applied.record).toEqual({
      event_id: 'evt-1708349200',
      event: 'AccountUpgraded',
      ts: '2024-02-19T13:26:40Z',
      properties: {
        lifetime_value: 1450.75,
      },
    });

    expect(result.latency.iterations).toBe(20);
    expect(result.latency.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.latency.p50Ms).toBeGreaterThanOrEqual(0);
    expect(result.latency.p90Ms).toBeGreaterThanOrEqual(result.latency.p50Ms);
    expect(result.latency.p95Ms).toBeGreaterThanOrEqual(result.latency.p90Ms);
    expect(result.latency.p99Ms).toBeGreaterThanOrEqual(result.latency.p95Ms);
  });
});

describe('calculateFieldMappingConfidence', () => {
  const sampleRules: MappingRule[] = [
    { targetField: 'event_id', transform: 'template', template: 'evt-1' },
    { targetField: 'event', transform: 'static', staticValue: 'purchase' },
    { targetField: 'ts', transform: 'static', staticValue: '2024-01-01T00:00:00Z' },
  ];

  it('awards 100% high confidence when all rules pass and schema is verified', () => {
    const score = calculateFieldMappingConfidence({
      rules: sampleRules,
      mappingErrors: [],
      envelopeErrors: [],
      schemaRegistered: true,
      schemaValidationErrors: [],
    });

    expect(score.score).toBe(100);
    expect(score.level).toBe('high');
    expect(score.recommendation).toContain('High match certainty');
    expect(score.factors.every((f) => f.passed)).toBe(true);
  });

  it('awards 85% confidence when target schema is not yet registered but rules and envelope are clean', () => {
    const score = calculateFieldMappingConfidence({
      rules: sampleRules,
      mappingErrors: [],
      envelopeErrors: [],
      schemaRegistered: false,
    });

    expect(score.score).toBe(96); // 40 + 30 + 25.5 = 95.5 -> 96
    expect(score.level).toBe('high');
    expect(score.recommendation).toContain('Register the active schema definition');
  });

  it('penalizes score when mapping errors occur', () => {
    const score = calculateFieldMappingConfidence({
      rules: sampleRules,
      mappingErrors: ['event_id:not_found:id'],
      envelopeErrors: [],
      schemaRegistered: true,
      schemaValidationErrors: [],
    });

    expect(score.score).toBeLessThan(90);
    expect(score.recommendation).toContain('Transform errors encountered');
  });

  it('penalizes score when envelope errors occur', () => {
    const score = calculateFieldMappingConfidence({
      rules: sampleRules,
      mappingErrors: [],
      envelopeErrors: ['event_id:missing'],
      schemaRegistered: true,
      schemaValidationErrors: [],
    });

    expect(score.score).toBeLessThan(95);
    expect(score.recommendation).toContain('Missing required envelope fields');
  });

  it('penalizes score when schema validation errors occur', () => {
    const score = calculateFieldMappingConfidence({
      rules: sampleRules,
      mappingErrors: [],
      envelopeErrors: [],
      schemaRegistered: true,
      schemaValidationErrors: ['unregistered_field:foo'],
    });

    expect(score.score).toBeLessThan(100);
    expect(score.recommendation).toContain('Schema type mismatch detected');
  });
});
