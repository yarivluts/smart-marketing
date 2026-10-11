import { parseFormula, type FormulaAstNode } from './formula-parser';
import type { MetricCatalog } from './types';

/**
 * A period's value is always read from a `total`-grain query (see `TOTAL_GRAIN`) - never summed or
 * averaged out of a per-bucket series, which is only right for a plain count or sum. The helpers
 * here are the two small pieces every consumer of such a query needs.
 */

type RowValue = string | number | null | undefined;
type Row = Readonly<Record<string, RowValue>>;

/**
 * One metric's value from a `total`-grain result: the single row of the requested period (`current`
 * when the query had no compare, whose rows carry no `period` column). `null` when that period
 * returned no row - nothing was recorded - or the warehouse returned no value for it (a formula
 * dividing by an absent operand). A breakdown's rows are one per dimension combination, so they are
 * read individually, not through this.
 */
export function readPeriodValue(rows: readonly Row[], metricName: string, period: 'current' | 'previous' = 'current'): number | null {
  const row = rows.find((candidate) => (candidate.period === undefined || candidate.period === null ? period === 'current' : candidate.period === period));
  const raw = row?.[metricName];
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

const ACCUMULATING_FUNCTIONS = new Set(['count', 'count_distinct', 'sum']);

function nodeAccumulates(catalog: MetricCatalog, node: FormulaAstNode, resolving: Set<string>): boolean {
  switch (node.type) {
    case 'number':
      return false;
    case 'identifier':
      return metricAccumulatesInner(catalog, node.name, resolving);
    case 'unary':
      return nodeAccumulates(catalog, node.operand, resolving);
    case 'binary':
      if (node.op === '+' || node.op === '-') {
        return nodeAccumulates(catalog, node.left, resolving) && nodeAccumulates(catalog, node.right, resolving);
      }
      // Scaling by a constant keeps a running total a running total (`revenue * 0.8`, `cost / 100`);
      // a product or quotient of two measured quantities is a rate.
      if (node.op === '*') {
        return (node.left.type === 'number' && nodeAccumulates(catalog, node.right, resolving)) || (node.right.type === 'number' && nodeAccumulates(catalog, node.left, resolving));
      }
      return node.right.type === 'number' && nodeAccumulates(catalog, node.left, resolving);
    case 'call':
      return false;
  }
}

function metricAccumulatesInner(catalog: MetricCatalog, name: string, resolving: Set<string>): boolean {
  const definition = catalog.get(name);
  if (!definition || resolving.has(name)) {
    return false;
  }
  if (definition.definitionKind === 'aggregation') {
    return definition.aggregation !== undefined && ACCUMULATING_FUNCTIONS.has(definition.aggregation.function);
  }
  resolving.add(name);
  try {
    return nodeAccumulates(catalog, parseFormula(definition.formula ?? ''), resolving);
  } catch {
    return false;
  } finally {
    resolving.delete(name);
  }
}

/**
 * Whether a metric's period value grows as its window grows - a running total such as signups,
 * spend, or net revenue (`revenue - refunds`) - as opposed to a level that holds whatever the window
 * length, such as a conversion rate, an average, or a min/max.
 *
 * A goal's pace depends on it: a running total is expected to reach `elapsed x target` by now, while
 * a level is judged against the target itself at every point of the window (a 5% conversion goal
 * wants 5% on day 3 as much as on day 30). count_distinct accumulates too - more of the window means
 * more distinct customers - even though it is not additive across buckets.
 */
export function metricAccumulatesOverPeriod(catalog: MetricCatalog, name: string): boolean {
  return metricAccumulatesInner(catalog, name, new Set());
}
