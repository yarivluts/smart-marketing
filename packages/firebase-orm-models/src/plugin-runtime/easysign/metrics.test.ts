import { describe, expect, it } from 'vitest';
import {
  EASYSIGN_ALL_METRICS,
  EASYSIGN_AGGREGATION_METRICS,
  EASYSIGN_FORMULA_METRICS,
  EASYSIGN_DOCUMENTS_CREATED_NAME,
  EASYSIGN_SIGNINGS_VIEWED_NAME,
  EASYSIGN_DOCUMENTS_SIGNED_NAME,
  EASYSIGN_DOCUMENTS_DECLINED_NAME,
  EASYSIGN_COMPLETION_RATE_NAME,
  EASYSIGN_AVG_TURNAROUND_NAME,
} from './metrics';
import { CORE_TABLE_CATALOG } from '../../warehouse/core-table-catalog';

describe('EasySign Metrics Definitions (KAN-84)', () => {
  it('declares the funnel metrics and the completion-rate formula', () => {
    const names = EASYSIGN_ALL_METRICS.map((m) => m.name);
    expect(names).toContain(EASYSIGN_DOCUMENTS_CREATED_NAME);
    expect(names).toContain(EASYSIGN_SIGNINGS_VIEWED_NAME);
    expect(names).toContain(EASYSIGN_DOCUMENTS_SIGNED_NAME);
    expect(names).toContain(EASYSIGN_DOCUMENTS_DECLINED_NAME);
    expect(names).toContain(EASYSIGN_COMPLETION_RATE_NAME);
  });

  it('does not register the average-turnaround metric: signingDurationSec is a payload field, not an events column (see the pack doc comment)', () => {
    expect(EASYSIGN_ALL_METRICS.map((m) => m.name)).not.toContain(EASYSIGN_AVG_TURNAROUND_NAME);
  });

  it('declares valid formulas referencing registered aggregations', () => {
    const completionRate = EASYSIGN_FORMULA_METRICS.find((m) => m.name === EASYSIGN_COMPLETION_RATE_NAME);
    expect(completionRate).toBeDefined();
    expect(completionRate?.definition.kind).toBe('formula');
    if (completionRate?.definition.kind === 'formula') {
      expect(completionRate.definition.formula).toContain(EASYSIGN_DOCUMENTS_SIGNED_NAME);
      expect(completionRate.definition.formula).toContain(EASYSIGN_DOCUMENTS_CREATED_NAME);
    }
  });

  it('every aggregation targets real columns of the dbt events core table (the EasySign audit found them pointing at event_name/ts, which never existed)', () => {
    const events = CORE_TABLE_CATALOG.events;
    for (const metric of EASYSIGN_AGGREGATION_METRICS) {
      if (metric.definition.kind !== 'aggregation') {
        continue;
      }
      const { aggregation } = metric.definition;
      expect(aggregation.table).toBe('events');
      expect(events[aggregation.timeColumn], `${metric.name} timeColumn`).toBeDefined();
      if (aggregation.column) {
        expect(events[aggregation.column], `${metric.name} column`).toBeDefined();
      }
      for (const filter of aggregation.filters) {
        expect(events[filter.field], `${metric.name} filter ${filter.field}`).toBeDefined();
      }
      for (const dimension of metric.dimensions) {
        expect(events[dimension], `${metric.name} dimension ${dimension}`).toBeDefined();
      }
    }
  });
});
