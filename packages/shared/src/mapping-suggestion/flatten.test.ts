import { describe, expect, it } from 'vitest';
import { flattenSamplePayload } from './flatten';

describe('flattenSamplePayload', () => {
  it('flattens nested objects and array elements into dotted/bracketed JSONPaths', () => {
    const payload = {
      id: 1,
      email: 'jon@example.com',
      customer: { id: 2, email: 'jon@example.com' },
      line_items: [
        { sku: 'A', quantity: 1 },
        { sku: 'B', quantity: 2 },
      ],
    };

    const flattened = flattenSamplePayload(payload);

    expect(flattened).toEqual(
      expect.arrayContaining([
        { path: 'id', value: 1 },
        { path: 'email', value: 'jon@example.com' },
        { path: 'customer.id', value: 2 },
        { path: 'customer.email', value: 'jon@example.com' },
        { path: 'line_items[0].sku', value: 'A' },
        { path: 'line_items[0].quantity', value: 1 },
        { path: 'line_items[1].sku', value: 'B' },
        { path: 'line_items[1].quantity', value: 2 },
      ]),
    );
  });

  it('skips null/undefined leaves and does not descend into them', () => {
    const flattened = flattenSamplePayload({ a: null, b: undefined, c: 'x' });
    expect(flattened).toEqual([{ path: 'c', value: 'x' }]);
  });

  it('skips a top-level array payload rather than emitting an invalid bare "[0]" path', () => {
    expect(flattenSamplePayload([{ a: 1 }])).toEqual([]);
  });

  it('bounds how many elements of a single array are scanned', () => {
    const payload = { items: [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }] };
    const flattened = flattenSamplePayload(payload, { maxArrayItems: 2 });
    expect(flattened).toEqual([
      { path: 'items[0].v', value: 1 },
      { path: 'items[1].v', value: 2 },
    ]);
  });

  it('bounds how deep nested objects are walked', () => {
    const payload = { a: { b: { c: { d: 'too-deep' } } } };
    const flattened = flattenSamplePayload(payload, { maxDepth: 2 });
    expect(flattened).toEqual([]);
  });

  it('returns nothing for a payload with no scalar leaves', () => {
    expect(flattenSamplePayload({})).toEqual([]);
    expect(flattenSamplePayload(null)).toEqual([]);
  });
});
