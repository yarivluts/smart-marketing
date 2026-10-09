/**
 * Latency profiling and transform confidence scoring for the field-mapping engine (KAN-309).
 *
 * Evaluates execution latency percentiles (p50, p90, p95, p99) across sample iterations
 * and computes semantic/syntactic transformation confidence scores (0-100%).
 */

import { MappingRule, MappingApplyResult } from './types';
import { applyFieldMapping } from './engine';

export interface FieldMappingLatencyMetrics {
  avgLatencyMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  iterations: number;
  totalTimeMs: number;
}

export interface FieldMappingConfidenceFactor {
  name: string;
  weight: number;
  score: number;
  passed: boolean;
  notes?: string;
}

export interface FieldMappingConfidenceScore {
  score: number; // 0 to 100
  level: 'high' | 'medium' | 'low';
  factors: readonly FieldMappingConfidenceFactor[];
  recommendation: string;
}

export interface ProfiledFieldMappingResult {
  applied: MappingApplyResult;
  latency: FieldMappingLatencyMetrics;
}

export interface CalculateConfidenceOptions {
  rules: readonly MappingRule[];
  mappingErrors: readonly string[];
  envelopeErrors?: readonly string[];
  schemaRegistered?: boolean;
  schemaValidationErrors?: readonly string[];
  samplePayload?: unknown;
}

/**
 * Runs a micro-benchmark profiling session for field mapping rules against a sample payload.
 * Measures execution duration across multiple iterations and computes latency percentiles.
 */
export function benchmarkFieldMappingLatency(
  rules: readonly MappingRule[],
  payload: unknown,
  iterations = 25,
): ProfiledFieldMappingResult {
  const safeIterations = Math.max(1, Math.min(100, iterations));
  const latencies: number[] = [];
  let firstResult: MappingApplyResult | null = null;

  for (let i = 0; i < safeIterations; i++) {
    const start = performance.now();
    const result = applyFieldMapping(rules, payload);
    const end = performance.now();

    if (firstResult === null) {
      firstResult = result;
    }
    const elapsed = Math.max(0.01, end - start);
    latencies.push(elapsed);
  }

  latencies.sort((a, b) => a - b);
  const total = latencies.reduce((acc, v) => acc + v, 0);
  const avg = total / latencies.length;

  function percentile(arr: readonly number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * arr.length)));
    return arr[index]!;
  }

  const latency: FieldMappingLatencyMetrics = {
    avgLatencyMs: Number(avg.toFixed(2)),
    p50Ms: Number(percentile(latencies, 50).toFixed(2)),
    p90Ms: Number(percentile(latencies, 90).toFixed(2)),
    p95Ms: Number(percentile(latencies, 95).toFixed(2)),
    p99Ms: Number(percentile(latencies, 99).toFixed(2)),
    iterations: latencies.length,
    totalTimeMs: Number(total.toFixed(2)),
  };

  return {
    applied: firstResult ?? { record: {}, errors: [] },
    latency,
  };
}

/**
 * Calculates a multi-factor transformation confidence score (0-100%) and actionable recommendation.
 */
export function calculateFieldMappingConfidence(
  options: CalculateConfidenceOptions,
): FieldMappingConfidenceScore {
  const { rules, mappingErrors, envelopeErrors = [], schemaRegistered = false, schemaValidationErrors = [] } = options;

  // Factor 1: Rule Evaluation (weight 0.40)
  const totalRules = rules.length;
  let ruleScore = 100;
  let ruleNotes = 'All mapping rules evaluated without errors.';
  if (totalRules === 0) {
    ruleScore = 0;
    ruleNotes = 'No mapping rules defined.';
  } else if (mappingErrors.length > 0) {
    const errorCount = mappingErrors.length;
    const cleanRules = Math.max(0, totalRules - errorCount);
    ruleScore = Math.max(0, Math.round((cleanRules / totalRules) * 100));
    ruleNotes = `${errorCount} of ${totalRules} rules failed evaluation (${mappingErrors.slice(0, 2).join(', ')}).`;
  }

  const ruleFactor: FieldMappingConfidenceFactor = {
    name: 'rule_evaluation',
    weight: 0.4,
    score: ruleScore,
    passed: mappingErrors.length === 0 && totalRules > 0,
    notes: ruleNotes,
  };

  // Factor 2: Envelope Conformance (weight 0.30)
  let envelopeScore = 100;
  let envelopeNotes = 'All required envelope headers present and non-empty.';
  if (envelopeErrors.length > 0) {
    envelopeScore = Math.max(0, 100 - envelopeErrors.length * 35);
    envelopeNotes = `Envelope issues detected: ${envelopeErrors.join(', ')}`;
  }

  const envelopeFactor: FieldMappingConfidenceFactor = {
    name: 'envelope_conformance',
    weight: 0.3,
    score: envelopeScore,
    passed: envelopeErrors.length === 0,
    notes: envelopeNotes,
  };

  // Factor 3: Target Schema Alignment (weight 0.30)
  let schemaScore = 100;
  let schemaNotes = 'Strict match against registered schema definition.';
  if (!schemaRegistered) {
    if (mappingErrors.length === 0 && envelopeErrors.length === 0) {
      schemaScore = 85;
      schemaNotes = 'Target schema is not yet registered in registry; draft syntax is valid.';
    } else {
      schemaScore = 50;
      schemaNotes = 'Target schema is not registered; mapping errors present.';
    }
  } else if (schemaValidationErrors.length > 0) {
    schemaScore = Math.max(0, 100 - schemaValidationErrors.length * 25);
    schemaNotes = `Schema validation errors: ${schemaValidationErrors.slice(0, 2).join(', ')}`;
  }

  const schemaFactor: FieldMappingConfidenceFactor = {
    name: 'schema_alignment',
    weight: 0.3,
    score: schemaScore,
    passed: schemaRegistered && schemaValidationErrors.length === 0,
    notes: schemaNotes,
  };

  const compositeScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        ruleFactor.score * ruleFactor.weight +
          envelopeFactor.score * envelopeFactor.weight +
          schemaFactor.score * schemaFactor.weight,
      ),
    ),
  );

  let level: 'high' | 'medium' | 'low';
  if (compositeScore >= 90) {
    level = 'high';
  } else if (compositeScore >= 70) {
    level = 'medium';
  } else {
    level = 'low';
  }

  let recommendation: string;
  if (envelopeErrors.length > 0) {
    recommendation = `Missing required envelope fields (${envelopeErrors.join(', ')}). Map source attributes to root envelope.`;
  } else if (mappingErrors.length > 0) {
    recommendation = `Transform errors encountered (${mappingErrors.slice(0, 2).join(', ')}). Check source JSONPath syntax.`;
  } else if (schemaValidationErrors.length > 0) {
    recommendation = `Schema type mismatch detected (${schemaValidationErrors.slice(0, 2).join(', ')}). Align target property types.`;
  } else if (!schemaRegistered) {
    recommendation = 'Transform rules execute cleanly. Register the active schema definition to lock in strict validation.';
  } else if (compositeScore >= 95) {
    recommendation = 'High match certainty for telemetry data types. All schema properties strictly validated.';
  } else {
    recommendation = 'Review payload structure and transformation types for optimal ingestion.';
  }

  return {
    score: compositeScore,
    level,
    factors: [ruleFactor, envelopeFactor, schemaFactor],
    recommendation,
  };
}
