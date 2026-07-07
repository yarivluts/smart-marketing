import { BadRequestException } from '@nestjs/common';
import { parseMetricQueryRequestBody } from './metrics-request';

const VALID_TIME = { start: '2026-01-01', end: '2026-01-07', grain: 'day' };

describe('parseMetricQueryRequestBody', () => {
  it('parses a single metric name into a one-element metrics array', () => {
    const parsed = parseMetricQueryRequestBody({ metric: 'cac', time: VALID_TIME });
    expect(parsed.metrics).toEqual(['cac']);
    expect(parsed.dimensions).toBeUndefined();
    expect(parsed.filters).toBeUndefined();
    expect(parsed.time).toEqual({ start: '2026-01-01', end: '2026-01-07', grain: 'day' });
  });

  it('parses an array of metric names', () => {
    const parsed = parseMetricQueryRequestBody({ metric: ['ad_spend', 'signups'], time: VALID_TIME });
    expect(parsed.metrics).toEqual(['ad_spend', 'signups']);
  });

  it('parses dimensions, filters (mapping "op" to "operator"), and a compare period', () => {
    const parsed = parseMetricQueryRequestBody({
      metric: 'cac',
      dimensions: ['channel'],
      filters: [{ field: 'geo', op: '=', value: 'IL' }],
      time: { ...VALID_TIME, grain: 'week', compare: 'previous_period' },
    });
    expect(parsed.dimensions).toEqual(['channel']);
    expect(parsed.filters).toEqual([{ field: 'geo', operator: '=', value: 'IL' }]);
    expect(parsed.time).toEqual({ start: '2026-01-01', end: '2026-01-07', grain: 'week', compare: 'previous_period' });
  });

  it('rejects a non-object body', () => {
    expect(() => parseMetricQueryRequestBody('not an object')).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody(null)).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody(['array'])).toThrow(BadRequestException);
  });

  it('rejects a missing or empty "metric"', () => {
    expect(() => parseMetricQueryRequestBody({ time: VALID_TIME })).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody({ metric: '', time: VALID_TIME })).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody({ metric: [], time: VALID_TIME })).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody({ metric: [123], time: VALID_TIME })).toThrow(BadRequestException);
  });

  it('rejects a non-array "dimensions"', () => {
    expect(() => parseMetricQueryRequestBody({ metric: 'cac', dimensions: 'channel', time: VALID_TIME })).toThrow(BadRequestException);
  });

  it('rejects a malformed filter entry', () => {
    expect(() => parseMetricQueryRequestBody({ metric: 'cac', filters: 'not-an-array', time: VALID_TIME })).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody({ metric: 'cac', filters: [{ field: 'geo' }], time: VALID_TIME })).toThrow(BadRequestException);
  });

  it('rejects a filter with an unknown operator', () => {
    expect(() =>
      parseMetricQueryRequestBody({ metric: 'cac', filters: [{ field: 'geo', op: 'like', value: 'IL' }], time: VALID_TIME }),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing "time" or missing time fields', () => {
    expect(() => parseMetricQueryRequestBody({ metric: 'cac' })).toThrow(BadRequestException);
    expect(() => parseMetricQueryRequestBody({ metric: 'cac', time: { start: '2026-01-01', grain: 'day' } })).toThrow(BadRequestException);
  });

  it('rejects an unknown time grain', () => {
    expect(() => parseMetricQueryRequestBody({ metric: 'cac', time: { ...VALID_TIME, grain: 'decade' } })).toThrow(BadRequestException);
  });

  it('rejects an unknown compare period', () => {
    expect(() => parseMetricQueryRequestBody({ metric: 'cac', time: { ...VALID_TIME, compare: 'last_year' } })).toThrow(BadRequestException);
  });
});
