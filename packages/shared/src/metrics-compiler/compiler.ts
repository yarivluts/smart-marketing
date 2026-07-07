import { assertSafeIdentifier, quoteIdentifier } from './identifiers';
import { collectIdentifiers, parseFormula, type FormulaAstNode } from './formula-parser';
import { bucketExpression, computeCompareWindow, type TimeWindow } from './time';
import {
  METRIC_FILTER_OPERATORS,
  MetricCompilerError,
  type CompilerAggregationDef,
  type CompilerFilter,
  type CompilerMetricDefinition,
  type CompilerParamValue,
  type CompiledMetricQuery,
  type MetricCatalog,
  type MetricQueryRequest,
  type TimeGrain,
} from './types';

interface Period {
  suffix: 'current' | 'previous';
  window: TimeWindow;
}

function getDefinition(catalog: MetricCatalog, name: string): CompilerMetricDefinition {
  const definition = catalog.get(name);
  if (!definition) {
    throw new MetricCompilerError(`Unknown metric "${name}" — it must be registered before it can be queried.`);
  }
  return definition;
}

/**
 * Every leaf (aggregation-kind) metric a requested metric transitively
 * depends on. The registry (KAN-40) already rejects circular formula
 * references at write time, but a hand-built catalog passed straight to
 * this pure function could still be cyclic, so `resolving` re-detects it
 * defensively rather than recursing forever.
 */
function collectLeafNames(catalog: MetricCatalog, name: string, resolving: Set<string>, leaves: Set<string>): void {
  if (leaves.has(name)) {
    return;
  }
  if (resolving.has(name)) {
    throw new MetricCompilerError(`Circular metric reference involving "${name}".`);
  }
  const definition = getDefinition(catalog, name);
  if (definition.definitionKind === 'aggregation') {
    leaves.add(name);
    return;
  }
  resolving.add(name);
  for (const referenceName of collectIdentifiers(parseFormula(definition.formula ?? ''))) {
    collectLeafNames(catalog, referenceName, resolving, leaves);
  }
  resolving.delete(name);
}

function buildAggregateExpr(agg: CompilerAggregationDef): string {
  if (agg.function === 'count') {
    return agg.column ? `COUNT(${quoteIdentifier(assertSafeIdentifier(agg.column, 'column'))})` : 'COUNT(*)';
  }
  if (!agg.column) {
    throw new MetricCompilerError(`Aggregation function "${agg.function}" requires a column.`);
  }
  const columnSql = quoteIdentifier(assertSafeIdentifier(agg.column, 'column'));
  if (agg.function === 'count_distinct') {
    return `COUNT(DISTINCT ${columnSql})`;
  }
  return `${agg.function.toUpperCase()}(${columnSql})`;
}

/**
 * `field` and `value` are already safe (an identifier check, and a bind
 * `@param` respectively) — `operator` is the one piece of a filter that gets
 * spliced into the SQL text directly (`${columnSql} ${filter.operator}
 * @${paramName}`), so it must be checked against the known vocabulary too,
 * not just trusted from `CompilerFilter`'s TS type. `apps/api`'s
 * `metrics-request.ts` (KAN-42) already rejects an unknown `op` at the HTTP
 * boundary, but this compiler is also a plain, importable function any
 * future caller (a hand-built catalog, the AI Analyst's `query_metric`
 * tool, ...) could invoke without going through that boundary — defense in
 * depth belongs here too, not only at one caller's edge.
 */
function emitFilterClause(filter: CompilerFilter, paramName: string, params: Record<string, CompilerParamValue>): string {
  if (!METRIC_FILTER_OPERATORS.includes(filter.operator)) {
    throw new MetricCompilerError(`Unknown filter operator "${filter.operator}" on "${filter.field}".`);
  }
  const columnSql = quoteIdentifier(assertSafeIdentifier(filter.field, 'filter field'));
  if (filter.operator === 'in') {
    params[paramName] = filter.value
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return `${columnSql} IN UNNEST(@${paramName})`;
  }
  params[paramName] = filter.value;
  return `${columnSql} ${filter.operator} @${paramName}`;
}

interface LeafCte {
  cteName: string;
  sql: string;
}

function buildLeafCte(
  leafName: string,
  agg: CompilerAggregationDef,
  dimensions: readonly string[],
  queryFilters: readonly CompilerFilter[],
  period: Period,
  grain: TimeGrain,
  params: Record<string, CompilerParamValue>,
): LeafCte {
  const cteName = `leaf_${leafName}_${period.suffix}`;
  const valueAlias = `value_${leafName}`;
  const tableSql = quoteIdentifier(assertSafeIdentifier(agg.table, 'table'));
  const timeColumnSql = quoteIdentifier(assertSafeIdentifier(agg.timeColumn, 'time column'));
  const dimensionColumns = dimensions.map((dimension) => quoteIdentifier(assertSafeIdentifier(dimension, 'dimension')));

  const startParam = `time_start_${period.suffix}`;
  const endParam = `time_end_${period.suffix}`;
  params[startParam] = period.window.start;
  params[endParam] = period.window.end;

  const whereClauses = [`${timeColumnSql} >= @${startParam}`, `${timeColumnSql} <= @${endParam}`];
  agg.filters.forEach((filter, index) => whereClauses.push(emitFilterClause(filter, `filter_${leafName}_${index}`, params)));
  queryFilters.forEach((filter, index) => whereClauses.push(emitFilterClause(filter, `qfilter_${index}`, params)));

  const selectColumns = [
    `${bucketExpression(timeColumnSql, grain)} AS bucket_date`,
    ...dimensionColumns.map((column) => `${column} AS ${column}`),
    `${buildAggregateExpr(agg)} AS ${valueAlias}`,
  ];
  const groupByColumns = ['bucket_date', ...dimensionColumns];

  const sql = [
    `${cteName} AS (`,
    '  SELECT',
    selectColumns.map((column) => `    ${column}`).join(',\n'),
    `  FROM ${tableSql}`,
    `  WHERE ${whereClauses.join(' AND ')}`,
    `  GROUP BY ${groupByColumns.join(', ')}`,
    ')',
  ].join('\n');

  return { cteName, sql };
}

/** Emits a metric's own value as a SQL expression: a leaf's CTE column directly, or a formula's AST recursively inlined (formulas have no CTE of their own — nothing materializes them). */
function emitMetricValue(catalog: MetricCatalog, name: string, resolving: Set<string>): string {
  const definition = getDefinition(catalog, name);
  if (definition.definitionKind === 'aggregation') {
    return `value_${name}`;
  }
  if (resolving.has(name)) {
    throw new MetricCompilerError(`Circular metric reference involving "${name}".`);
  }
  resolving.add(name);
  const sql = emitFormulaAst(catalog, parseFormula(definition.formula ?? ''), resolving);
  resolving.delete(name);
  return sql;
}

function emitFormulaAst(catalog: MetricCatalog, node: FormulaAstNode, resolving: Set<string>): string {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'identifier':
      return emitMetricValue(catalog, node.name, resolving);
    case 'unary':
      return `(-${emitFormulaAst(catalog, node.operand, resolving)})`;
    case 'binary': {
      const left = emitFormulaAst(catalog, node.left, resolving);
      const right = emitFormulaAst(catalog, node.right, resolving);
      // `/` compiles to SAFE_DIVIDE, not a literal `/` — see formula-parser.ts's doc comment.
      return node.op === '/' ? `SAFE_DIVIDE(${left}, ${right})` : `(${left} ${node.op} ${right})`;
    }
  }
}

/**
 * Compiles a set of already-resolved metric definitions + a query request
 * into BigQuery SQL (KAN-41, plan `13 §E5.2`): buckets by the requested time
 * grain, breaks down by the requested dimensions, and — when `compare` is
 * set — unions a `previous` window alongside `current`, tagged by a
 * `period` column.
 *
 * Known simplification (documented, not a bug): every dimension/filter field
 * name is compiled as if it were a literal column on the aggregation's own
 * `table` — there is no join-graph model yet (plan `04 §1`'s raw
 * fact/dim split would need one for e.g. `channel` to resolve through
 * `dim_channel`). This assumes a denormalized mart layer, the same
 * "buildable today" scope every other compiler-shaped story in this repo
 * has taken; a real join-aware version is future work once dbt (KAN-37)
 * exists to build that mart.
 */
export function compileMetricQuery(catalog: MetricCatalog, request: MetricQueryRequest): CompiledMetricQuery {
  const metricNames = [...new Set(request.metrics)];
  if (metricNames.length === 0) {
    throw new MetricCompilerError('A query must request at least one metric.');
  }

  const definitions = new Map(metricNames.map((name) => [name, getDefinition(catalog, name)] as const));

  const dimensions = [...new Set(request.dimensions ?? [])];
  for (const [name, definition] of definitions) {
    const unsupported = dimensions.filter((dimension) => !definition.dimensions.includes(dimension));
    if (unsupported.length > 0) {
      throw new MetricCompilerError(`Metric "${name}" cannot be broken down by: ${unsupported.join(', ')}.`);
    }
  }

  const leafNames = new Set<string>();
  for (const name of metricNames) {
    collectLeafNames(catalog, name, new Set(), leafNames);
  }
  if (leafNames.size === 0) {
    throw new MetricCompilerError('No aggregation metrics were resolved for this query.');
  }

  const dimensionColumnsSql = dimensions.map((dimension) => quoteIdentifier(assertSafeIdentifier(dimension, 'dimension')));

  const { current, previous } = computeCompareWindow(request.time);
  const periods: Period[] = previous ? [{ suffix: 'current', window: current }, { suffix: 'previous', window: previous }] : [{ suffix: 'current', window: current }];

  const params: Record<string, CompilerParamValue> = {};
  const cteBlocks: string[] = [];
  const periodSelects: string[] = [];

  for (const period of periods) {
    const leaves = [...leafNames].map((leafName) => {
      const aggregation = getDefinition(catalog, leafName).aggregation;
      if (!aggregation) {
        throw new MetricCompilerError(`Metric "${leafName}" has no aggregation to compile.`);
      }
      return buildLeafCte(leafName, aggregation, dimensions, request.filters ?? [], period, request.time.grain, params);
    });
    cteBlocks.push(...leaves.map((leaf) => leaf.sql));

    const usingColumns = ['bucket_date', ...dimensionColumnsSql];
    let fromClause = leaves[0].cteName;
    for (let i = 1; i < leaves.length; i += 1) {
      fromClause += `\n  FULL JOIN ${leaves[i].cteName} USING (${usingColumns.join(', ')})`;
    }

    const metricColumns = metricNames.map((name) => `${emitMetricValue(catalog, name, new Set())} AS ${quoteIdentifier(name)}`);
    const selectColumns = [...(previous ? [`'${period.suffix}' AS period`] : []), 'bucket_date', ...dimensionColumnsSql, ...metricColumns];

    periodSelects.push(['SELECT', `  ${selectColumns.join(',\n  ')}`, `FROM ${fromClause}`].join('\n'));
  }

  const orderByColumns = [...(previous ? ['period'] : []), 'bucket_date', ...dimensionColumnsSql];
  const sql = `WITH\n${cteBlocks.join(',\n')}\n${periodSelects.join('\nUNION ALL\n')}\nORDER BY ${orderByColumns.join(', ')}`;

  return { sql, params };
}
