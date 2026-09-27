import { describe, expect, it } from 'vitest';
import {
  buildMetricLineage,
  catalogStats,
  formulaInputs,
  pickLineageFocus,
  schemaForTable,
  tallestLineageColumn,
  toCatalogMetrics,
  type MetricFamilyLike,
} from './metric-lineage';

const aggregation = (table: string, column = 'value', status: 'active' | 'superseded' | 'archived' = 'active', version = 1) => ({
  version,
  status,
  definitionKind: 'aggregation' as const,
  aggregation: { function: 'sum', table, column },
  formula: null,
});
const formula = (text: string, status: 'active' | 'archived' = 'active') => ({ version: 1, status, definitionKind: 'formula' as const, aggregation: null, formula: text });

const FAMILIES: MetricFamilyLike[] = [
  { name: 'ad_spend', versions: [aggregation('fact_ad_spend', 'reporting_spend', 'superseded', 1), aggregation('fact_ad_spend', 'reporting_spend', 'active', 2)] },
  { name: 'signups', versions: [aggregation('fact_funnel_event', 'id')] },
  { name: 'new_paying', versions: [aggregation('fact_funnel_event', 'id')] },
  { name: 'cost_per_signup', versions: [formula('ad_spend / signups')] },
  { name: 'cac', versions: [formula('max(ad_spend, 0) / new_paying')] },
  { name: 'cac_ratio', versions: [formula('cac / cost_per_signup')] },
  { name: 'old_ratio', versions: [formula('ad_spend / 2', 'archived')] },
];

describe('formulaInputs', () => {
  it('lists the referenced metrics once each, without functions or numbers', () => {
    expect(formulaInputs('max(ad_spend - refunds, 0) / ad_spend')).toEqual(['ad_spend', 'refunds']);
    expect(formulaInputs(null)).toEqual([]);
  });

  it('falls back to an identifier scan for a formula the parser rejects', () => {
    expect(formulaInputs('ad_spend / / signups')).toEqual(['ad_spend', 'signups']);
  });
});

describe('catalog stats', () => {
  const metrics = toCatalogMetrics(FAMILIES);

  it('describes each family by its latest version', () => {
    expect(metrics.find((metric) => metric.name === 'ad_spend')).toMatchObject({ version: 2, versionCount: 2, table: 'fact_ad_spend', column: 'reporting_spend' });
    expect(metrics.find((metric) => metric.name === 'cac')!.inputs).toEqual(['ad_spend', 'new_paying']);
  });

  it('counts kinds, sources and reuse over active metrics only', () => {
    const stats = catalogStats(metrics);
    expect(stats).toMatchObject({ active: 6, archived: 1, aggregation: 3, formula: 3, evolved: 1 });
    expect(stats.tables).toEqual([
      { table: 'fact_funnel_event', count: 2 },
      { table: 'fact_ad_spend', count: 1 },
    ]);
    // The archived old_ratio's reference to ad_spend is not counted.
    expect(stats.reuse[0]).toEqual({ name: 'ad_spend', count: 2 });
  });
});

describe('pickLineageFocus', () => {
  const metrics = toCatalogMetrics(FAMILIES);
  it('honours a requested metric, else opens on the deepest formula', () => {
    expect(pickLineageFocus(metrics, 'signups')).toBe('signups');
    expect(pickLineageFocus(metrics, 'nope')).toBe('cac_ratio');
  });
  it('falls back to the first active metric when there are no formulas', () => {
    expect(pickLineageFocus(toCatalogMetrics(FAMILIES.slice(0, 2)), undefined)).toBe('ad_spend');
    expect(pickLineageFocus([], undefined)).toBeNull();
  });
});

describe('schemaForTable', () => {
  it('links only tables whose name spells out a registered schema', () => {
    const schemas = new Set(['ad_spend', 'signup']);
    expect(schemaForTable('fact_ad_spend', schemas)).toBe('ad_spend');
    expect(schemaForTable('m_0123456789ab_signup', schemas)).toBe('signup');
    expect(schemaForTable('ad_spend', schemas)).toBe('ad_spend');
    expect(schemaForTable('fact_funnel_event', schemas)).toBeNull();
    expect(schemaForTable('dim_signup', schemas)).toBeNull();
  });
});

describe('buildMetricLineage', () => {
  const metrics = toCatalogMetrics(FAMILIES);

  it('walks upstream to tables and schemas and adds the direct downstream formulas', () => {
    const { nodes, edges } = buildMetricLineage(metrics, 'cost_per_signup', new Set(['ad_spend']));
    const byName = (name: string) => nodes.find((node) => node.name === name)!;
    expect(nodes.map((node) => `${node.type}:${node.name}`).sort()).toEqual(
      ['metric:cost_per_signup', 'metric:ad_spend', 'table:fact_ad_spend', 'schema:ad_spend', 'metric:signups', 'table:fact_funnel_event', 'metric:cac_ratio'].sort(),
    );
    expect(byName('cost_per_signup').focus).toBe(true);
    const has = (source: string, target: string) => edges.some((edge) => edge.source === source && edge.target === target);
    expect(has(nodes.find((node) => node.type === 'schema')!.id, byName('fact_ad_spend').id)).toBe(true);
    expect(has(byName('fact_ad_spend').id, byName('ad_spend').id)).toBe(true);
    expect(has(byName('ad_spend').id, byName('cost_per_signup').id)).toBe(true);
    expect(has(byName('cost_per_signup').id, byName('cac_ratio').id)).toBe(true);
  });

  it('uses index ids so no name leaks into an accessible label, and marks unknown inputs missing', () => {
    const broken = toCatalogMetrics([{ name: 'broken', versions: [formula('ad_spend / ghost')] }, FAMILIES[0]]);
    const { nodes } = buildMetricLineage(broken, 'broken', new Set());
    expect(nodes.every((node) => /^n\d+$/.test(node.id))).toBe(true);
    expect(nodes.find((node) => node.name === 'ghost')!.type).toBe('missing');
  });

  it('measures the tallest column for sizing the diagram', () => {
    const graph = buildMetricLineage(metrics, 'cost_per_signup', new Set(['ad_spend']));
    // schema | 2 tables | ad_spend + signups | cost_per_signup | cac_ratio -> the two-node columns win.
    expect(tallestLineageColumn(graph)).toBe(2);
    expect(tallestLineageColumn({ nodes: [], edges: [] })).toBe(1);
  });

  it('is empty for an unknown focus', () => {
    expect(buildMetricLineage(metrics, 'ghost', new Set())).toEqual({ nodes: [], edges: [] });
  });
});
