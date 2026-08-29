import { describe, expect, it } from 'vitest';
import {
  EASYSIGN_ALL_METRICS,
  EASYSIGN_AGGREGATION_METRICS,
  EASYSIGN_FORMULA_METRICS,
  EASYSIGN_DOCUMENTS_CREATED_NAME,
  EASYSIGN_SIGNINGS_VIEWED_NAME,
  EASYSIGN_DOCUMENTS_SIGNED_NAME,
  EASYSIGN_COMPLETION_RATE_NAME,
  EASYSIGN_AVG_TURNAROUND_NAME,
} from './metrics';

describe('EasySign Metrics Definitions (KAN-84)', () => {
  it('declares all funnel and velocity metrics', () => {
    const names = EASYSIGN_ALL_METRICS.map((m) => m.name);
    expect(names).toContain(EASYSIGN_DOCUMENTS_CREATED_NAME);
    expect(names).toContain(EASYSIGN_SIGNINGS_VIEWED_NAME);
    expect(names).toContain(EASYSIGN_DOCUMENTS_SIGNED_NAME);
    expect(names).toContain(EASYSIGN_COMPLETION_RATE_NAME);
    expect(names).toContain(EASYSIGN_AVG_TURNAROUND_NAME);
  });

  it('declares valid formulas referencing registered aggregations', () => {
    const completionRate = EASYSIGN_FORMULA_METRICS.find(
      (m) => m.name === EASYSIGN_COMPLETION_RATE_NAME,
    );
    expect(completionRate).toBeDefined();
    expect(completionRate?.definition.kind).toBe('formula');
    if (completionRate?.definition.kind === 'formula') {
      expect(completionRate.definition.formula).toContain(EASYSIGN_DOCUMENTS_SIGNED_NAME);
      expect(completionRate.definition.formula).toContain(EASYSIGN_DOCUMENTS_CREATED_NAME);
    }
  });

  it('includes signingTier dimension on document signing metrics for tier breakdown', () => {
    const signedMetric = EASYSIGN_AGGREGATION_METRICS.find(
      (m) => m.name === EASYSIGN_DOCUMENTS_SIGNED_NAME,
    );
    expect(signedMetric?.dimensions).toContain('signingTier');
  });
});

