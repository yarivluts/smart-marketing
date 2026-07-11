import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateWinRuleRequestBody, parseUpdateWinRuleRequestBody } from './parse-win-rule-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('parseCreateWinRuleRequestBody', () => {
  it('accepts a well-formed request with filters', async () => {
    const body = { name: 'Big order', schemaName: 'order_completed', filters: [{ field: 'properties.amount', operator: '>', value: '100' }] };
    const parsed = await parseCreateWinRuleRequestBody(request(body));
    expect(parsed).toEqual(body);
  });

  it('defaults to an empty filter list when omitted', async () => {
    const parsed = await parseCreateWinRuleRequestBody(request({ name: 'First charge', schemaName: 'first_charge' }));
    expect(parsed).toEqual({ name: 'First charge', schemaName: 'first_charge', filters: [] });
  });

  it('rejects an empty name', async () => {
    const parsed = await parseCreateWinRuleRequestBody(request({ name: '  ', schemaName: 'order_completed' }));
    expect(parsed.error?.status).toBe(400);
  });

  it('rejects a missing schemaName', async () => {
    const parsed = await parseCreateWinRuleRequestBody(request({ name: 'Big order' }));
    expect(parsed.error?.status).toBe(400);
  });

  it('rejects a filter with an unknown operator', async () => {
    const body = { name: 'Big order', schemaName: 'order_completed', filters: [{ field: 'amount', operator: 'in', value: '100' }] };
    const parsed = await parseCreateWinRuleRequestBody(request(body));
    expect(parsed.error?.status).toBe(400);
  });

  it('rejects a malformed filter shape', async () => {
    const body = { name: 'Big order', schemaName: 'order_completed', filters: [{ field: 'amount' }] };
    const parsed = await parseCreateWinRuleRequestBody(request(body));
    expect(parsed.error?.status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const parsed = await parseCreateWinRuleRequestBody(request());
    expect(parsed.error?.status).toBe(400);
  });
});

describe('parseUpdateWinRuleRequestBody', () => {
  it('accepts a partial update (active only)', async () => {
    const parsed = await parseUpdateWinRuleRequestBody(request({ active: false }));
    expect(parsed).toEqual({ active: false });
  });

  it('accepts a partial update (name + filters)', async () => {
    const body = { name: 'Huge order', filters: [{ field: 'properties.amount', operator: '>=', value: '1000' }] };
    const parsed = await parseUpdateWinRuleRequestBody(request(body));
    expect(parsed).toEqual(body);
  });

  it('accepts an empty body (no-op update)', async () => {
    const parsed = await parseUpdateWinRuleRequestBody(request({}));
    expect(parsed).toEqual({});
  });

  it('rejects an empty name when present', async () => {
    const parsed = await parseUpdateWinRuleRequestBody(request({ name: '   ' }));
    expect(parsed.error?.status).toBe(400);
  });

  it('rejects a non-boolean active', async () => {
    const parsed = await parseUpdateWinRuleRequestBody(request({ active: 'yes' }));
    expect(parsed.error?.status).toBe(400);
  });

  it('rejects an invalid filter list (unknown operator)', async () => {
    const parsed = await parseUpdateWinRuleRequestBody(request({ filters: [{ field: 'amount', operator: '~=', value: '1' }] }));
    expect(parsed.error?.status).toBe(400);
  });
});
