import { describe, expect, it } from 'vitest';
import { computeCompareWindow } from './time';
import { MetricCompilerError } from './types';

describe('computeCompareWindow', () => {
  it('returns just the current window when no compare is requested', () => {
    expect(computeCompareWindow({ start: '2026-01-01', end: '2026-01-31', grain: 'month' })).toEqual({
      current: { start: '2026-01-01', end: '2026-01-31' },
    });
  });

  it('previous_period shifts back by the exact window length, no gap or overlap', () => {
    const { previous } = computeCompareWindow({ start: '2026-02-01', end: '2026-02-28', grain: 'day', compare: 'previous_period' });
    expect(previous).toEqual({ start: '2026-01-04', end: '2026-01-31' });
  });

  it('previous_year shifts start/end back exactly one calendar year on ordinary dates', () => {
    const { previous } = computeCompareWindow({ start: '2026-01-01', end: '2026-01-31', grain: 'month', compare: 'previous_year' });
    expect(previous).toEqual({ start: '2025-01-01', end: '2025-01-31' });
  });

  it('previous_year clamps a Feb 29 end date to Feb 28 in a non-leap target year instead of overflowing into March', () => {
    // Regression: Date#setUTCFullYear on 2024-02-29 minus one year rolls over
    // to 2023-03-01 (2023 has no Feb 29), spilling the compare window into March.
    const { previous } = computeCompareWindow({ start: '2024-02-01', end: '2024-02-29', grain: 'month', compare: 'previous_year' });
    expect(previous).toEqual({ start: '2023-02-01', end: '2023-02-28' });
  });

  it('previous_year clamps a Feb 29 start date the same way', () => {
    const { previous } = computeCompareWindow({ start: '2024-02-29', end: '2024-03-01', grain: 'day', compare: 'previous_year' });
    expect(previous).toEqual({ start: '2023-02-28', end: '2023-03-01' });
  });

  it('rejects an end date before the start date', () => {
    expect(() => computeCompareWindow({ start: '2026-02-01', end: '2026-01-01', grain: 'day' })).toThrow(MetricCompilerError);
  });

  it('rejects an unknown compare period', () => {
    expect(() =>
      // @ts-expect-error deliberately invalid compare value
      computeCompareWindow({ start: '2026-01-01', end: '2026-01-31', grain: 'month', compare: 'last_quarter' }),
    ).toThrow(MetricCompilerError);
  });
});
