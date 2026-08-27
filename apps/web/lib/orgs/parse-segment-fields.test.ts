import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateSegmentRequestBody, parseUpdateSegmentRequestBody } from './parse-segment-fields';

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
    expect(parsed).toEqual({ ...validBody, eventConditions: [] });
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

  it('accepts an empty (or omitted) filters array when at least one event condition is present (KAN-93)', async () => {
    const body = { name: 'No demo', schemaName: 'customer', filters: [], eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }] };
    const parsed = await parseCreateSegmentRequestBody(request(body));
    expect(parsed).toEqual(body);

    const omittedFilters = { name: 'No demo', schemaName: 'customer', eventConditions: [{ kind: 'no_event', schemaName: 'demo_event' }] };
    expect(await parseCreateSegmentRequestBody(request(omittedFilters))).toEqual({ ...omittedFilters, filters: [] });
  });

  it('accepts a "has_event" event condition with a nested filter and a withinDays lookback', async () => {
    const body = {
      ...validBody,
      eventConditions: [{ kind: 'has_event', schemaName: 'demo_event', withinDays: 30, filters: [{ field: 'stage', op: '=', value: 'held' }] }],
    };
    expect(await parseCreateSegmentRequestBody(request(body))).toEqual(body);
  });

  it('rejects a non-array eventConditions', async () => {
    expect((await parseCreateSegmentRequestBody(request({ ...validBody, eventConditions: 'nope' }))).error?.status).toBe(400);
  });

  it('rejects an event condition with an unknown kind', async () => {
    const body = { ...validBody, eventConditions: [{ kind: 'sometimes_event', schemaName: 'demo_event' }] };
    expect((await parseCreateSegmentRequestBody(request(body))).error?.status).toBe(400);
  });

  it('rejects an event condition with a missing/blank schemaName', async () => {
    const body = { ...validBody, eventConditions: [{ kind: 'no_event' }] };
    expect((await parseCreateSegmentRequestBody(request(body))).error?.status).toBe(400);
  });

  it('rejects an event condition with a malformed nested filter', async () => {
    const body = { ...validBody, eventConditions: [{ kind: 'no_event', schemaName: 'demo_event', filters: [{ field: 'stage', op: 'like', value: 'held' }] }] };
    expect((await parseCreateSegmentRequestBody(request(body))).error?.status).toBe(400);
  });

  it('rejects an event condition with a zero, negative, or non-integer withinDays', async () => {
    expect(
      (await parseCreateSegmentRequestBody(request({ ...validBody, eventConditions: [{ kind: 'no_event', schemaName: 'demo_event', withinDays: 0 }] })))
        .error?.status,
    ).toBe(400);
    expect(
      (await parseCreateSegmentRequestBody(request({ ...validBody, eventConditions: [{ kind: 'no_event', schemaName: 'demo_event', withinDays: 2.5 }] })))
        .error?.status,
    ).toBe(400);
  });
});

function patchRequest(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('parseUpdateSegmentRequestBody', () => {
  it('dispatches a definition-shaped body to the "definition" branch (KAN-120)', async () => {
    const parsed = await parseUpdateSegmentRequestBody(patchRequest(validBody));
    expect(parsed).toEqual({ kind: 'definition', ...validBody, eventConditions: [] });
  });

  it('dispatches an owner/status-shaped body to the "worklist" branch (KAN-81)', async () => {
    expect(await parseUpdateSegmentRequestBody(patchRequest({ status: 'done' }))).toEqual({ kind: 'worklist', status: 'done' });
    expect(await parseUpdateSegmentRequestBody(patchRequest({ ownerPersonId: 'person-1' }))).toEqual({ kind: 'worklist', ownerPersonId: 'person-1' });
    expect(await parseUpdateSegmentRequestBody(patchRequest({ ownerPersonId: 'person-1', status: 'done' }))).toEqual({
      kind: 'worklist',
      ownerPersonId: 'person-1',
      status: 'done',
    });
  });

  it('re-validates a definition body with the same rules parseCreateSegmentRequestBody applies', async () => {
    const parsed = await parseUpdateSegmentRequestBody(patchRequest({ ...validBody, name: '  ' }));
    expect(parsed.error?.status).toBe(400);
  });

  it('re-validates a worklist body with the same rules the standalone worklist parser applied', async () => {
    expect((await parseUpdateSegmentRequestBody(patchRequest({ status: 'archived' }))).error?.status).toBe(400);
    expect((await parseUpdateSegmentRequestBody(patchRequest({ ownerPersonId: '  ' }))).error?.status).toBe(400);
  });

  it('rejects a body naming both definition and worklist fields as ambiguous', async () => {
    const parsed = await parseUpdateSegmentRequestBody(patchRequest({ ...validBody, status: 'done' }));
    expect(parsed.error?.status).toBe(400);
    expect((await (parsed.error as Response).json()).error).toBe('mixed_update_fields');
  });

  it('rejects a body with neither definition nor worklist fields', async () => {
    const parsed = await parseUpdateSegmentRequestBody(patchRequest({}));
    expect(parsed.error?.status).toBe(400);
    expect((await (parsed.error as Response).json()).error).toBe('no_fields_to_update');
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseUpdateSegmentRequestBody(badRequest)).error?.status).toBe(400);
  });
});
