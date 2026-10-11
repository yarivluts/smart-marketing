import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RELATIVE_DATE_RANGE,
  RELATIVE_DATE_PRESETS,
  describeInvalidDateRangeSetting,
  isDateOnly,
  isRelativeDatePreset,
  normalizeDateRangeSetting,
  resolveDateRangeSetting,
  resolveRelativeDatePreset,
  todayUtcDateOnly,
} from './date-range';
import { computeCompareWindow } from './time';

describe('resolveRelativeDatePreset', () => {
  const today = '2026-09-26';

  it('trailing presets end today and include it', () => {
    expect(resolveRelativeDatePreset('last_7_days', today)).toEqual({ start: '2026-09-20', end: today });
    expect(resolveRelativeDatePreset('last_14_days', today)).toEqual({ start: '2026-09-13', end: today });
    expect(resolveRelativeDatePreset('last_30_days', today)).toEqual({ start: '2026-08-28', end: today });
    expect(resolveRelativeDatePreset('last_90_days', today)).toEqual({ start: '2026-06-29', end: today });
    expect(resolveRelativeDatePreset('last_365_days', today)).toEqual({ start: '2025-09-27', end: today });
  });

  it('to-date presets start at the calendar boundary', () => {
    expect(resolveRelativeDatePreset('month_to_date', today)).toEqual({ start: '2026-09-01', end: today });
    expect(resolveRelativeDatePreset('quarter_to_date', today)).toEqual({ start: '2026-07-01', end: today });
    expect(resolveRelativeDatePreset('year_to_date', today)).toEqual({ start: '2026-01-01', end: today });
  });

  it('last_month is the previous full calendar month, across a year boundary too', () => {
    expect(resolveRelativeDatePreset('last_month', today)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(resolveRelativeDatePreset('last_month', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(resolveRelativeDatePreset('last_month', '2024-03-01')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });

  it('on the first day of a period, the to-date window is that single day', () => {
    expect(resolveRelativeDatePreset('month_to_date', '2026-10-01')).toEqual({ start: '2026-10-01', end: '2026-10-01' });
    expect(resolveRelativeDatePreset('quarter_to_date', '2026-10-01')).toEqual({ start: '2026-10-01', end: '2026-10-01' });
  });

  it('every preset resolves to an ordered window', () => {
    for (const preset of RELATIVE_DATE_PRESETS) {
      const { start, end } = resolveRelativeDatePreset(preset, today);
      expect(isDateOnly(start) && isDateOnly(end) && start <= end).toBe(true);
    }
  });

  it('rejects a malformed reference date', () => {
    expect(() => resolveRelativeDatePreset('last_7_days', '26/09/2026')).toThrow();
  });
});

describe('resolveDateRangeSetting', () => {
  it('a relative setting rolls forward with today', () => {
    expect(resolveDateRangeSetting(DEFAULT_RELATIVE_DATE_RANGE, '2026-08-27')).toEqual({ start: '2026-07-29', end: '2026-08-27', grain: 'day' });
    expect(resolveDateRangeSetting(DEFAULT_RELATIVE_DATE_RANGE, '2026-09-26')).toEqual({ start: '2026-08-28', end: '2026-09-26', grain: 'day' });
  });

  it('an absolute setting (including the legacy shape without kind) passes through unchanged', () => {
    expect(resolveDateRangeSetting({ start: '2026-08-01', end: '2026-08-27', grain: 'week' }, '2026-09-26')).toEqual({
      start: '2026-08-01',
      end: '2026-08-27',
      grain: 'week',
    });
  });

  it('a resolved relative range feeds the previous-period compare window like any absolute one', () => {
    const resolved = resolveDateRangeSetting({ kind: 'relative', preset: 'last_7_days', grain: 'day' }, '2026-09-26');
    expect(computeCompareWindow({ ...resolved, compare: 'previous_period' })).toEqual({
      current: { start: '2026-09-20', end: '2026-09-26' },
      previous: { start: '2026-09-13', end: '2026-09-19' },
    });
  });

  it('defaults "today" to the current UTC date', () => {
    expect(resolveDateRangeSetting({ kind: 'relative', preset: 'last_7_days', grain: 'day' }).end).toBe(todayUtcDateOnly());
  });
});

describe('normalizeDateRangeSetting', () => {
  it('reads the legacy { start, end, grain } shape as absolute', () => {
    expect(normalizeDateRangeSetting({ start: '2026-08-01', end: '2026-08-27', grain: 'day' })).toEqual({
      kind: 'absolute',
      start: '2026-08-01',
      end: '2026-08-27',
      grain: 'day',
    });
  });

  it('keeps only the fields of its kind', () => {
    expect(normalizeDateRangeSetting({ kind: 'relative', preset: 'last_90_days', grain: 'week', start: '2026-01-01', end: '2026-01-02' })).toEqual({
      kind: 'relative',
      preset: 'last_90_days',
      grain: 'week',
    });
    expect(normalizeDateRangeSetting({ kind: 'absolute', start: '2026-01-01', end: '2026-01-02', grain: 'day', preset: 'last_7_days' })).toEqual({
      kind: 'absolute',
      start: '2026-01-01',
      end: '2026-01-02',
      grain: 'day',
    });
  });

  it('rejects unrecognisable input', () => {
    expect(normalizeDateRangeSetting(null)).toBeNull();
    expect(normalizeDateRangeSetting('last_30_days')).toBeNull();
    expect(normalizeDateRangeSetting({ kind: 'relative', preset: 'last_2_days', grain: 'day' })).toBeNull();
    expect(normalizeDateRangeSetting({ kind: 'relative', preset: 'last_7_days', grain: 'hour' })).toBeNull();
    expect(normalizeDateRangeSetting({ kind: 'rolling', start: '2026-01-01', end: '2026-01-02', grain: 'day' })).toBeNull();
    expect(normalizeDateRangeSetting({ start: '2026-01-01', grain: 'day' })).toBeNull();
  });
});

describe('validation helpers', () => {
  it('isDateOnly accepts real calendar dates only', () => {
    expect(isDateOnly('2026-02-28')).toBe(true);
    expect(isDateOnly('2024-02-29')).toBe(true);
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isDateOnly('2026-2-3')).toBe(false);
    expect(isDateOnly(20260203)).toBe(false);
  });

  it('isRelativeDatePreset', () => {
    expect(isRelativeDatePreset('last_30_days')).toBe(true);
    expect(isRelativeDatePreset('last_31_days')).toBe(false);
  });

  it('describeInvalidDateRangeSetting', () => {
    expect(describeInvalidDateRangeSetting({ kind: 'relative', preset: 'last_7_days', grain: 'day' })).toBeNull();
    expect(describeInvalidDateRangeSetting({ kind: 'absolute', start: '2026-01-01', end: '2026-01-31', grain: 'day' })).toBeNull();
    expect(describeInvalidDateRangeSetting({ kind: 'absolute', start: '2026-02-01', end: '2026-01-31', grain: 'day' })).toMatch(/after its end/);
    expect(describeInvalidDateRangeSetting({ kind: 'absolute', start: 'yesterday', end: '2026-01-31', grain: 'day' })).toMatch(/YYYY-MM-DD/);
  });
});
