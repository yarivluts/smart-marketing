import { describe, expect, it } from 'vitest';
import { blankMetricDefinitionFormState, metricDefinitionFormStateToRequestBody } from './metric-definition-editor';

describe('metricDefinitionFormStateToRequestBody', () => {
  it('builds an aggregation request body, including the column when set', () => {
    const state = { ...blankMetricDefinitionFormState(), table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', dimensions: 'channel' };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect(body).toEqual({
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: ['channel'],
    });
  });

  it('omits column from the request body when it is blank or only whitespace', () => {
    const state = { ...blankMetricDefinitionFormState(), table: 'events', column: '   ', timeColumn: 'ts' };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect(body.definition).toEqual({ kind: 'aggregation', aggregation: { function: 'sum', table: 'events', timeColumn: 'ts', filters: [] } });
    expect('column' in (body.definition as { aggregation: object }).aggregation).toBe(false);
  });

  it('trims a non-blank column before including it', () => {
    const state = { ...blankMetricDefinitionFormState(), table: 'events', column: '  amount  ', timeColumn: 'ts' };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect((body.definition as { aggregation: { column?: string } }).aggregation.column).toBe('amount');
  });

  it('carries filter rows through as-is', () => {
    const state = {
      ...blankMetricDefinitionFormState(),
      table: 'fact_ad_spend',
      timeColumn: 'date',
      filters: [{ field: 'channel', operator: '=' as const, value: 'google' }],
    };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect((body.definition as { aggregation: { filters: unknown[] } }).aggregation.filters).toEqual([{ field: 'channel', operator: '=', value: 'google' }]);
  });

  it('builds a formula request body and ignores aggregation-only fields', () => {
    const state = { ...blankMetricDefinitionFormState(), kind: 'formula' as const, formula: 'ad_spend / new_paying', table: 'unused', column: 'unused' };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect(body.definition).toEqual({ kind: 'formula', formula: 'ad_spend / new_paying' });
  });

  it('splits dimensions on commas, trimming whitespace and dropping empty entries', () => {
    const state = { ...blankMetricDefinitionFormState(), table: 'events', timeColumn: 'ts', dimensions: ' channel ,, campaign ,source' };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect(body.dimensions).toEqual(['channel', 'campaign', 'source']);
  });

  it('returns an empty dimensions array for blank dimensions input', () => {
    const state = { ...blankMetricDefinitionFormState(), table: 'events', timeColumn: 'ts', dimensions: '   ' };
    const body = metricDefinitionFormStateToRequestBody(state);
    expect(body.dimensions).toEqual([]);
  });
});
