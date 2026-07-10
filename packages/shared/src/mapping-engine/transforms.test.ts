import { describe, expect, it } from 'vitest';
import { castMappingValue, renderTemplate, templatePlaceholderPaths } from './transforms';

describe('castMappingValue', () => {
  it('casts to string: passes strings through, stringifies numbers/booleans, JSON-stringifies objects', () => {
    expect(castMappingValue('already', 'string')).toEqual({ ok: true, value: 'already' });
    expect(castMappingValue(42, 'string')).toEqual({ ok: true, value: '42' });
    expect(castMappingValue(true, 'string')).toEqual({ ok: true, value: 'true' });
    expect(castMappingValue({ a: 1 }, 'string')).toEqual({ ok: true, value: '{"a":1}' });
    expect(castMappingValue(null, 'string').ok).toBe(false);
    expect(castMappingValue(undefined, 'string').ok).toBe(false);
  });

  it('casts to number: passes numbers through, parses numeric strings, rejects the rest', () => {
    expect(castMappingValue(42, 'number')).toEqual({ ok: true, value: 42 });
    expect(castMappingValue('42.5', 'number')).toEqual({ ok: true, value: 42.5 });
    expect(castMappingValue('not a number', 'number').ok).toBe(false);
    expect(castMappingValue('', 'number').ok).toBe(false);
  });

  it('casts to boolean: passes booleans through, maps "true"/"false"/1/0, rejects the rest', () => {
    expect(castMappingValue(false, 'boolean')).toEqual({ ok: true, value: false });
    expect(castMappingValue('true', 'boolean')).toEqual({ ok: true, value: true });
    expect(castMappingValue('false', 'boolean')).toEqual({ ok: true, value: false });
    expect(castMappingValue(1, 'boolean')).toEqual({ ok: true, value: true });
    expect(castMappingValue(0, 'boolean')).toEqual({ ok: true, value: false });
    expect(castMappingValue('nope', 'boolean').ok).toBe(false);
  });

  it('casts to timestamp: passes a parseable date string through as ISO, treats a small number as unix seconds and a large one as millis', () => {
    expect(castMappingValue('2024-01-01T00:00:00Z', 'timestamp')).toEqual({ ok: true, value: '2024-01-01T00:00:00.000Z' });
    expect(castMappingValue(1704067200, 'timestamp')).toEqual({ ok: true, value: '2024-01-01T00:00:00.000Z' });
    expect(castMappingValue(1704067200000, 'timestamp')).toEqual({ ok: true, value: '2024-01-01T00:00:00.000Z' });
    expect(castMappingValue('not a date', 'timestamp').ok).toBe(false);
  });

  it('casts to object/array: only accepts a value already of that shape', () => {
    expect(castMappingValue({ a: 1 }, 'object')).toEqual({ ok: true, value: { a: 1 } });
    expect(castMappingValue([1, 2], 'object').ok).toBe(false);
    expect(castMappingValue([1, 2], 'array')).toEqual({ ok: true, value: [1, 2] });
    expect(castMappingValue({ a: 1 }, 'array').ok).toBe(false);
  });
});

describe('templatePlaceholderPaths', () => {
  it('extracts every {{path}} placeholder in order', () => {
    expect(templatePlaceholderPaths('{{a.b}} and {{ c.d }}')).toEqual(['a.b', 'c.d']);
  });

  it('returns an empty array for a template with no placeholders', () => {
    expect(templatePlaceholderPaths('a static string')).toEqual([]);
  });
});

describe('renderTemplate', () => {
  const payload = { data: { object: { id: 'ord_123', currency: 'usd' } } };

  it('substitutes every placeholder with its extracted value', () => {
    const result = renderTemplate('{{data.object.id}}-{{data.object.currency}}', payload);
    expect(result).toEqual({ ok: true, value: 'ord_123-usd' });
  });

  it('renders a template with no placeholders unchanged', () => {
    expect(renderTemplate('a static string', payload)).toEqual({ ok: true, value: 'a static string' });
  });

  it('fails when a placeholder path does not resolve', () => {
    const result = renderTemplate('{{data.object.missing}}', payload);
    expect(result).toEqual({ ok: false, error: ['data.object.missing'] });
  });

  it('collects every unresolved placeholder, not just the first', () => {
    const result = renderTemplate('{{data.missing_a}}-{{data.missing_b}}', payload);
    expect(result).toEqual({ ok: false, error: ['data.missing_a', 'data.missing_b'] });
  });
});
