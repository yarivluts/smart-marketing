import { describe, expect, it } from 'vitest';
import { capSmallMultiples, formatBucketLabels, labeledAxisIndexes, labeledValueIndexes, MAX_FULLY_LABELED_POINTS, MAX_SMALL_MULTIPLES } from './chart-labels';

describe('capSmallMultiples (KAN-217)', () => {
  const series = (label: string, ...values: (number | null)[]) => ({ label, points: values.map((value, index) => ({ bucket: `b${index}`, value })) });

  it('keeps every series when there are no more than the cap', () => {
    const input = [series('a', 1), series('b', 2), series('c', 3)];
    expect(capSmallMultiples(input)).toEqual({ shown: input, hidden: [] });
    expect(MAX_SMALL_MULTIPLES).toBe(3);
  });

  it('keeps the largest-total series in their original order and hides the rest', () => {
    const input = [series('a', 1, 1), series('b', 10), series('c', null, 0), series('d', 4, null), series('e', 5)];
    const { shown, hidden } = capSmallMultiples(input);
    expect(shown.map((entry) => entry.label)).toEqual(['b', 'd', 'e']);
    expect(hidden.map((entry) => entry.label)).toEqual(['a', 'c']);
  });

  it('breaks ties in favour of the earlier series', () => {
    const input = [series('a', 1), series('b', 1), series('c', 1)];
    expect(capSmallMultiples(input, 2).shown.map((entry) => entry.label)).toEqual(['a', 'b']);
  });
});

describe('formatBucketLabels', () => {
  it('renders daily date buckets as day + month in the viewer locale', () => {
    expect(formatBucketLabels(['2026-09-24', '2026-09-25'], 'en')).toEqual(['9/24', '9/25']);
    expect(formatBucketLabels(['2026-09-24', '2026-09-25'], 'he')).toEqual(['24.9', '25.9']);
  });

  it('accepts a midnight ISO timestamp bucket and formats it as the same calendar day, not shifted by time zone', () => {
    expect(formatBucketLabels(['2026-09-25T00:00:00.000Z', '2026-09-26T00:00:00Z'], 'en')).toEqual(['9/25', '9/26']);
  });

  it('adds the year only when the buckets span more than one', () => {
    expect(formatBucketLabels(['2025-12-31', '2026-01-02'], 'en')).toEqual(['12/31/25', '1/2/26']);
  });

  it('renders month-start buckets spanning several months as month + four-digit year', () => {
    expect(formatBucketLabels(['2026-08-01', '2026-09-01'], 'en')).toEqual(['Aug 2026', 'Sep 2026']);
  });

  it('keeps day + month for a daily range that merely includes a first of the month', () => {
    expect(formatBucketLabels(['2026-08-31', '2026-09-01'], 'en')).toEqual(['8/31', '9/1']);
  });

  it('returns non-date buckets unchanged', () => {
    expect(formatBucketLabels(['week-1', '2026-09-25'], 'en')).toEqual(['week-1', '2026-09-25']);
    expect(formatBucketLabels([], 'en')).toEqual([]);
  });
});

describe('labeledValueIndexes', () => {
  it('labels every point of a short series', () => {
    expect([...labeledValueIndexes([1, 3, 0])]).toEqual([0, 1, 2]);
  });

  it('labels only the peak and the latest point of a long series', () => {
    const values = Array.from({ length: MAX_FULLY_LABELED_POINTS + 8 }, (_, index) => (index === 4 ? 99 : 1));
    expect([...labeledValueIndexes(values)].sort((a, b) => a - b)).toEqual([4, values.length - 1]);
  });

  it('never labels a gap (null), and treats the last real value as the latest', () => {
    expect([...labeledValueIndexes([1, null, 0])]).toEqual([0, 2]);
    const values = Array.from({ length: MAX_FULLY_LABELED_POINTS + 8 }, (_, index) => (index === 4 ? 99 : index >= 15 ? null : 1));
    expect([...labeledValueIndexes(values)].sort((a, b) => a - b)).toEqual([4, 14]);
    expect([...labeledValueIndexes(Array.from({ length: MAX_FULLY_LABELED_POINTS + 1 }, () => null))]).toEqual([]);
  });
});

describe('labeledAxisIndexes', () => {
  it('labels every bucket of a short series', () => {
    expect(labeledAxisIndexes(3).size).toBe(3);
  });

  it('thins a long axis to a handful of evenly spaced labels that always include the latest bucket', () => {
    const axis = labeledAxisIndexes(30);
    expect(axis.has(29)).toBe(true);
    expect(axis.size).toBeLessThanOrEqual(8);
    expect(axis.size).toBeGreaterThanOrEqual(5);
  });
});
