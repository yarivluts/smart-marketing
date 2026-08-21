import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateSegmentRequestBody } from './parse-segment-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validBody = {
  name: 'High-value trials',
  schemaName: 'stripe_subscription',
  filters: [{ field: 'plan_interval', op: '=', value: 'month' }],
};

describe('parseCreateSegmentRequestBody', () => {
  it('accepts a well-formed request', async () => {
    const parsed = await parseCreateSegmentRequestBody(request(validBody));
    expect(parsed).toEqual(validBody);
  });

  it('accepts numeric and boolean filter values', async () => {
    const body = { ...validBody, filters: [{ field: 'mrr_normalized', op: '>', value: 100 }, { field: 'is_conflicted', op: '=', value: false }] };
    const parsed = await parseCreateSegmentRequestBody(request(body));
    expect(parsed.error).toBeUndefined();
    expect((parsed as { filters: unknown[] }).filters).toEqual(body.filters);
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseCreateSegmentRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or blank name/schemaName', async () => {
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, name: undefined }))).error?.status).toBe(400);
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, name: '  ' }))).error?.status).toBe(400);
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, schemaName: undefined }))).error?.status).toBe(400);
  });

  it('rejects a missing or empty filters array', async () => {
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, filters: undefined }))).error?.status).toBe(400);
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, filters: [] }))).error?.status).toBe(400);
  });

  it('rejects a filter with a missing or blank field', async () => {
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, filters: [{ op: '=', value: 'x' }] }))).error?.status).toBe(400);
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, filters: [{ field: '  ', op: '=', value: 'x' }] }))).error?.status).toBe(400);
  });

  it('rejects a filter with an unknown operator', async () => {
    const body = { ...validBody, filters: [{ field: 'plan_interval', op: 'like', value: 'month' }] };
    expect((await parseCreateSegmentRequestBody(request(body))).error?.status).toBe(400);
  });

  it('rejects a filter whose value is not a string/number/boolean', async () => {
    const body = { ...validBody, filters: [{ field: 'plan_interval', op: '=', value: { nested: true } }] };
    expect((await parseCreateSegmentRequestBody(request(body))).error?.status).toBe(400);
  });

  it('rejects a filter entry that is not an object', async () => {
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, filters: ['not-a-filter'] }))).error?.status).toBe(400);
  });
});
