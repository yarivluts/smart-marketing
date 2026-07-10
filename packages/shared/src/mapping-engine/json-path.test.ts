import { describe, expect, it } from 'vitest';
import { extractJsonPathValue, parseJsonPath } from './json-path';

describe('parseJsonPath', () => {
  it('parses a plain dotted path', () => {
    const result = parseJsonPath('data.object.amount');
    expect(result).toEqual({
      ok: true,
      value: [
        { type: 'key', key: 'data' },
        { type: 'key', key: 'object' },
        { type: 'key', key: 'amount' },
      ],
    });
  });

  it('strips a leading "$." root', () => {
    expect(parseJsonPath('$.data.object.amount')).toEqual(parseJsonPath('data.object.amount'));
  });

  it('strips a leading bare "$" root', () => {
    expect(parseJsonPath('$data')).toEqual(parseJsonPath('data'));
  });

  it('parses array indices', () => {
    const result = parseJsonPath('line_items[0].sku');
    expect(result).toEqual({
      ok: true,
      value: [
        { type: 'key', key: 'line_items' },
        { type: 'index', index: 0 },
        { type: 'key', key: 'sku' },
      ],
    });
  });

  it('parses chained indices on one segment', () => {
    const result = parseJsonPath('matrix[0][1]');
    expect(result).toEqual({
      ok: true,
      value: [
        { type: 'key', key: 'matrix' },
        { type: 'index', index: 0 },
        { type: 'index', index: 1 },
      ],
    });
  });

  it('rejects an empty path', () => {
    expect(parseJsonPath('')).toEqual({ ok: false, error: 'empty_path' });
    expect(parseJsonPath('   ')).toEqual({ ok: false, error: 'empty_path' });
    expect(parseJsonPath('$')).toEqual({ ok: false, error: 'empty_path' });
  });

  it('rejects a malformed segment', () => {
    const result = parseJsonPath('data..amount');
    expect(result.ok).toBe(false);
  });
});

describe('extractJsonPathValue', () => {
  const payload = {
    data: { object: { amount: 4200, currency: 'usd' } },
    line_items: [{ sku: 'ABC' }, { sku: 'DEF' }],
  };

  it('extracts a nested object value', () => {
    expect(extractJsonPathValue(payload, 'data.object.amount')).toEqual({ ok: true, value: 4200 });
  });

  it('extracts through an array index', () => {
    expect(extractJsonPathValue(payload, 'line_items[1].sku')).toEqual({ ok: true, value: 'DEF' });
  });

  it('reports a missing key as not found', () => {
    const result = extractJsonPathValue(payload, 'data.object.missing');
    expect(result.ok).toBe(false);
  });

  it('reports an out-of-range index as not found', () => {
    const result = extractJsonPathValue(payload, 'line_items[5].sku');
    expect(result.ok).toBe(false);
  });

  it('reports traversing into a non-object as not found', () => {
    const result = extractJsonPathValue(payload, 'data.object.amount.nested');
    expect(result.ok).toBe(false);
  });

  it('propagates a malformed path as an error', () => {
    const result = extractJsonPathValue(payload, '');
    expect(result).toEqual({ ok: false, error: 'empty_path' });
  });
});
