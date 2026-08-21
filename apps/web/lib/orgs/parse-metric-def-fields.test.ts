import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseMetricDefRequestBody } from './parse-metric-def-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validAggregationBody = {
  name: 'cost_per_signup',
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [{ field: 'channel', operator: '=', value: 'google' }] },
  },
  dimensions: ['channel'],
};

const validFormulaBody = {
  name: 'cac',
  definition: { kind: 'formula', formula: 'ad_spend / new_paying' },
  dimensions: [],
};

describe('parseMetricDefRequestBody', () => {
  it('accepts a well-formed aggregation definition, trimming the name', async () => {
    const parsed = await parseMetricDefRequestBody(request({ ...validAggregationBody, name: '  cost_per_signup  ' }));
    expect(parsed.error).toBeUndefined();
    expect(parsed).toEqual({ name: 'cost_per_signup', definition: validAggregationBody.definition, dimensions: ['channel'] });
  });

  it('accepts a well-formed aggregation definition with no column (count-style aggregations)', async () => {
    const body = { ...validAggregationBody, definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'events', timeColumn: 'ts', filters: [] } } };
    const parsed = await parseMetricDefRequestBody(request(body));
    expect(parsed.error).toBeUndefined();
    expect(parsed.definition).toEqual(body.definition);
    expect('column' in (parsed.definition as { aggregation: object }).aggregation).toBe(false);
  });

  it('accepts a well-formed formula definition', async () => {
    const parsed = await parseMetricDefRequestBody(request(validFormulaBody));
    expect(parsed).toEqual(validFormulaBody);
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseMetricDefRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or blank name', async () => {
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, name: undefined }))).error?.status).toBe(400);
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, name: '   ' }))).error?.status).toBe(400);
  });

  it('rejects a missing definition', async () => {
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, definition: undefined }))).error?.status).toBe(400);
  });

  it('rejects an unknown definition kind', async () => {
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, definition: { kind: 'not_a_kind' } }))).error?.status).toBe(400);
  });

  it('rejects a formula definition with a non-string formula', async () => {
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, definition: { kind: 'formula', formula: 123 } }))).error?.status).toBe(400);
  });

  it('rejects an aggregation definition missing function/table/timeColumn', async () => {
    const missingFunction = { kind: 'aggregation', aggregation: { table: 'fact_ad_spend', timeColumn: 'date', filters: [] } };
    const missingTable = { kind: 'aggregation', aggregation: { function: 'sum', timeColumn: 'date', filters: [] } };
    const missingTimeColumn = { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', filters: [] } };
    expect((await parseMetricDefRequestBody(request({ ...validAggregationBody, definition: missingFunction }))).error?.status).toBe(400);
    expect((await parseMetricDefRequestBody(request({ ...validAggregationBody, definition: missingTable }))).error?.status).toBe(400);
    expect((await parseMetricDefRequestBody(request({ ...validAggregationBody, definition: missingTimeColumn }))).error?.status).toBe(400);
  });

  it('rejects an aggregation definition whose filters is not an array', async () => {
    const definition = { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', timeColumn: 'date', filters: 'nope' } };
    expect((await parseMetricDefRequestBody(request({ ...validAggregationBody, definition }))).error?.status).toBe(400);
  });

  it('rejects an aggregation definition with a malformed filter entry', async () => {
    const definition = { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', timeColumn: 'date', filters: [{ field: 'channel', operator: '=' }] } };
    expect((await parseMetricDefRequestBody(request({ ...validAggregationBody, definition }))).error?.status).toBe(400);
  });

  it('rejects dimensions that are not an array of strings', async () => {
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, dimensions: 'channel' }))).error?.status).toBe(400);
    expect((await parseMetricDefRequestBody(request({ ...validFormulaBody, dimensions: ['channel', 1] }))).error?.status).toBe(400);
  });
});
