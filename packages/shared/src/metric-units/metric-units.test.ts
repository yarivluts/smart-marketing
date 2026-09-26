import { describe, expect, it } from 'vitest';
import {
  formatMetricValue,
  goalTargetFromEntry,
  goalTargetToEntry,
  goalTargetUnitProblem,
  metricUnitValueRange,
  normalizeMetricUnitInput,
  parseMetricUnit,
  resolveMetricUnit,
} from './metric-units';

describe('parseMetricUnit / normalizeMetricUnitInput', () => {
  it('accepts every unit kind and a currency pinned to an ISO code', () => {
    for (const kind of ['number', 'count', 'ratio', 'percent', 'currency', 'duration_seconds']) {
      expect(parseMetricUnit(kind)).toEqual({ kind });
    }
    expect(parseMetricUnit('currency:usd')).toEqual({ kind: 'currency', currency: 'USD' });
  });

  it('refuses unknown units and malformed currency codes', () => {
    expect(parseMetricUnit('percentage')).toBeNull();
    expect(parseMetricUnit('currency:US')).toBeNull();
    expect(parseMetricUnit('currency:')).toBeNull();
  });

  it('treats an absent unit as "none declared" and canonicalises a valid one', () => {
    expect(normalizeMetricUnitInput(undefined)).toEqual({ ok: true, unit: undefined });
    expect(normalizeMetricUnitInput('  ')).toEqual({ ok: true, unit: undefined });
    expect(normalizeMetricUnitInput(' currency:ils ')).toEqual({ ok: true, unit: 'currency:ILS' });
    expect(normalizeMetricUnitInput('ratio')).toEqual({ ok: true, unit: 'ratio' });
  });

  it('explains a refused unit', () => {
    const result = normalizeMetricUnitInput('fraction');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/Unknown metric unit "fraction".*ratio/);
    expect(normalizeMetricUnitInput(5)).toEqual({ ok: false, reason: 'A metric unit must be a string.' });
  });
});

describe('resolveMetricUnit', () => {
  it('falls back to a plain number when no unit is declared (backward compatible)', () => {
    expect(resolveMetricUnit(undefined)).toEqual({ kind: 'number' });
    expect(resolveMetricUnit('garbage')).toEqual({ kind: 'number' });
  });

  it('gives a bare currency the project currency, and keeps a pinned one', () => {
    expect(resolveMetricUnit('currency', 'ils')).toEqual({ kind: 'currency', currency: 'ILS' });
    expect(resolveMetricUnit('currency')).toEqual({ kind: 'currency' });
    expect(resolveMetricUnit('currency:USD', 'ILS')).toEqual({ kind: 'currency', currency: 'USD' });
  });
});

describe('formatMetricValue', () => {
  it('shows a ratio as a percent: 0.5 is 50%', () => {
    expect(formatMetricValue(0.5, 'ratio', 'en')).toBe('50%');
    expect(formatMetricValue(0.0834, 'ratio', 'en')).toBe('8.3%');
  });

  it('shows a percent value as-is with a percent sign', () => {
    expect(formatMetricValue(8, 'percent', 'en')).toBe('8%');
  });

  it('formats currency with its symbol, and without one when no code is known', () => {
    expect(formatMetricValue(1234.5, { kind: 'currency', currency: 'USD' }, 'en')).toBe('$1,234.50');
    expect(formatMetricValue(1234.5, 'currency', 'en')).toBe('1,234.5');
  });

  it('scales a duration to its largest unit', () => {
    expect(formatMetricValue(45, 'duration_seconds', 'en')).toBe('45 sec');
    expect(formatMetricValue(90, 'duration_seconds', 'en')).toBe('1.5 min');
    expect(formatMetricValue(7200, 'duration_seconds', 'en')).toBe('2 hr');
  });

  it('keeps the pre-unit display for a count, a number, and no unit at all', () => {
    expect(formatMetricValue(1234.567, 'count', 'en')).toBe('1,234.57');
    expect(formatMetricValue(0.5, 'number', 'en')).toBe('0.5');
    expect(formatMetricValue(0.5, undefined, 'en')).toBe('0.5');
  });
});

describe('goal targets', () => {
  it('enters a ratio target as a percent and stores it as a fraction', () => {
    expect(goalTargetFromEntry(8, 'ratio')).toBe(0.08);
    expect(goalTargetFromEntry(7, 'ratio')).toBe(0.07);
    expect(goalTargetToEntry(0.07, 'ratio')).toBe(7);
    expect(goalTargetFromEntry(8, 'count')).toBe(8);
    expect(goalTargetToEntry(8, undefined)).toBe(8);
  });

  it('knows each unit\'s valid range', () => {
    expect(metricUnitValueRange('ratio')).toEqual({ min: 0, max: 1 });
    expect(metricUnitValueRange('percent')).toEqual({ min: 0, max: 100 });
    expect(metricUnitValueRange('count')).toEqual({ min: 0 });
    expect(metricUnitValueRange('currency')).toEqual({});
    expect(metricUnitValueRange(undefined)).toEqual({});
  });

  it('refuses a ratio target outside 0..1 and suggests the fraction that was meant', () => {
    expect(goalTargetUnitProblem('Target', 8, 'ratio')).toBe(
      "Target 8 is outside the metric's range: it is a ratio (a 0-1 fraction shown as a percent), so the value must be between 0 and 1. For 8%, use 0.08.",
    );
    expect(goalTargetUnitProblem('Target', 0.08, 'ratio')).toBeNull();
    expect(goalTargetUnitProblem('Target', 1, 'ratio')).toBeNull();
  });

  it('refuses a percent over 100 and a negative count, and accepts anything for a plain number', () => {
    expect(goalTargetUnitProblem('Range max', 120, 'percent')).toMatch(/between 0 and 100/);
    expect(goalTargetUnitProblem('Target', -1, 'count')).toMatch(/count cannot be negative/);
    expect(goalTargetUnitProblem('Target', -1, 'duration_seconds')).toMatch(/duration cannot be negative/);
    expect(goalTargetUnitProblem('Target', 800, undefined)).toBeNull();
    expect(goalTargetUnitProblem('Target', -500, 'currency')).toBeNull();
  });
});
