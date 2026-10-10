import { collectIdentifiers, parseFormula } from '@growthos/shared';

/**
 * Metric-catalog shaping for the metric registry page: catalog stats and the lineage graph of one
 * metric (schema -> warehouse table -> aggregation metric -> formula metric). Pure functions over the
 * registered metric definitions and schema names the page already loads.
 */

export interface MetricVersionLike {
  version: number;
  status: 'active' | 'superseded' | 'archived';
  definitionKind: 'aggregation' | 'formula';
  aggregation: { function: string; table: string; column?: string } | null;
  formula: string | null;
}

export interface MetricFamilyLike {
  name: string;
  /** Oldest first, as the page groups them. */
  versions: readonly MetricVersionLike[];
}

export interface CatalogMetric {
  name: string;
  version: number;
  archived: boolean;
  definitionKind: 'aggregation' | 'formula';
  table: string | null;
  column: string | null;
  aggregationFunction: string | null;
  formula: string | null;
  /** Metric names the formula references, in first-use order (empty for an aggregation). */
  inputs: string[];
  versionCount: number;
}

const FORMULA_FUNCTIONS = new Set(['max', 'min']);

/** The metric names a formula references. Falls back to a plain identifier scan for a formula the parser rejects, so one malformed definition cannot take the page down. */
export function formulaInputs(formula: string | null): string[] {
  if (!formula) return [];
  let identifiers: string[];
  try {
    identifiers = collectIdentifiers(parseFormula(formula));
  } catch {
    identifiers = (formula.match(/[a-z][a-z0-9_]*/g) ?? []).filter((identifier) => !FORMULA_FUNCTIONS.has(identifier));
  }
  return [...new Set(identifiers)];
}

/** One row per metric family, describing its latest version (the one queries resolve against). */
export function toCatalogMetrics(families: readonly MetricFamilyLike[]): CatalogMetric[] {
  return families.flatMap((family) => {
    const latest = family.versions[family.versions.length - 1];
    if (!latest) return [];
    return [
      {
        name: family.name,
        version: latest.version,
        archived: latest.status === 'archived',
        definitionKind: latest.definitionKind,
        table: latest.aggregation?.table ?? null,
        column: latest.aggregation?.column ?? null,
        aggregationFunction: latest.aggregation?.function ?? null,
        formula: latest.formula,
        inputs: latest.definitionKind === 'formula' ? formulaInputs(latest.formula) : [],
        versionCount: family.versions.length,
      },
    ];
  });
}

export interface CatalogStats {
  active: number;
  archived: number;
  aggregation: number;
  formula: number;
  evolved: number;
  /** Warehouse tables active aggregation metrics read, busiest first. */
  tables: { table: string; count: number }[];
  /** Metrics referenced by active formula metrics, most referenced first. */
  reuse: { name: string; count: number }[];
}

export function catalogStats(metrics: readonly CatalogMetric[]): CatalogStats {
  const active = metrics.filter((metric) => !metric.archived);
  const tableCounts = new Map<string, number>();
  const reuseCounts = new Map<string, number>();
  for (const metric of active) {
    if (metric.table) tableCounts.set(metric.table, (tableCounts.get(metric.table) ?? 0) + 1);
    for (const input of metric.inputs) reuseCounts.set(input, (reuseCounts.get(input) ?? 0) + 1);
  }
  const ranked = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    active: active.length,
    archived: metrics.length - active.length,
    aggregation: active.filter((metric) => metric.definitionKind === 'aggregation').length,
    formula: active.filter((metric) => metric.definitionKind === 'formula').length,
    evolved: metrics.filter((metric) => metric.versionCount > 1).length,
    tables: ranked(tableCounts).map(([table, count]) => ({ table, count })),
    reuse: ranked(reuseCounts).map(([name, count]) => ({ name, count })),
  };
}

/**
 * The "metric types" breakdown: aggregation vs formula over active metrics only. Archived is a
 * status, not a type, so it never appears as a slice - the slices always sum to the "active
 * metrics" KPI.
 */
export function metricTypeSlices(stats: CatalogStats): { total: number; slices: { kind: 'aggregation' | 'formula'; value: number }[] } {
  return {
    total: stats.aggregation + stats.formula,
    slices: [
      { kind: 'aggregation', value: stats.aggregation },
      { kind: 'formula', value: stats.formula },
    ],
  };
}

/** Formula (computed) metrics as a whole-number share of active metrics, or null when there are none. */
export function formulaSharePercent(stats: CatalogStats): number | null {
  return stats.active > 0 ? Math.round((stats.formula / stats.active) * 100) : null;
}

/** The upstream size of a metric: how many metrics and tables it is built from, transitively. */
function upstreamSize(name: string, byName: ReadonlyMap<string, CatalogMetric>, seen = new Set<string>()): number {
  if (seen.has(name)) return 0;
  seen.add(name);
  const metric = byName.get(name);
  if (!metric) return 1;
  if (metric.definitionKind === 'aggregation') return metric.table ? 1 : 0;
  return metric.inputs.reduce((sum, input) => sum + 1 + upstreamSize(input, byName, seen), 0);
}

/**
 * Which metric the lineage diagram opens on: the requested one if it exists, else the active formula
 * metric with the deepest lineage (the most interesting graph), else the first active metric.
 */
export function pickLineageFocus(metrics: readonly CatalogMetric[], requested: string | undefined): string | null {
  if (requested && metrics.some((metric) => metric.name === requested)) return requested;
  const byName = new Map(metrics.map((metric) => [metric.name, metric]));
  const formulas = metrics
    .filter((metric) => !metric.archived && metric.definitionKind === 'formula')
    .map((metric) => ({ name: metric.name, size: upstreamSize(metric.name, byName) }))
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  if (formulas[0]) return formulas[0].name;
  return metrics.find((metric) => !metric.archived)?.name ?? metrics[0]?.name ?? null;
}

/**
 * The schema a warehouse table is built from, when the naming makes that explicit: a table named
 * exactly like the schema, a core mart named `fact_<schema>`, or a custom-schema mart view
 * `m_<tenant hash>_<schema>`. Anything else (a dbt core table fed by several schemas) is left
 * unlinked rather than guessed.
 */
export function schemaForTable(table: string, schemaNames: ReadonlySet<string>): string | null {
  const candidate = table.replace(/^fact_/, '').replace(/^m_[0-9a-f]{12}_/, '');
  return schemaNames.has(candidate) ? candidate : null;
}

/**
 * How many nodes the lineage graph's tallest column holds (columns by longest path from a source, the
 * same rule the flow diagram lays out by), so the page can give the diagram enough height.
 */
export function tallestLineageColumn(graph: { nodes: readonly { id: string }[]; edges: readonly LineageEdge[] }): number {
  const incoming = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge.source);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depthOf));
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };
  const counts = new Map<number, number>();
  for (const node of graph.nodes) {
    const column = depthOf(node.id);
    counts.set(column, (counts.get(column) ?? 0) + 1);
  }
  return Math.max(1, ...counts.values());
}

export type LineageNodeType ='metric' | 'table' | 'schema' | 'missing';

export interface LineageNode {
  /** Index-based, so an id never carries a metric or table name into an accessible label. */
  id: string;
  type: LineageNodeType;
  name: string;
  metric?: CatalogMetric;
  focus: boolean;
}

export interface LineageEdge {
  source: string;
  target: string;
}

/**
 * The focus metric's lineage: everything upstream of it, transitively (input metrics, the tables the
 * aggregations read, and a table's schema when its name says so), plus the formula metrics that use
 * it directly. Edges run from source data towards the derived metric. A formula input that is not in
 * the catalog becomes a `missing` node, since that is a broken definition worth seeing.
 */
export function buildMetricLineage(metrics: readonly CatalogMetric[], focusName: string, schemaNames: ReadonlySet<string>): { nodes: LineageNode[]; edges: LineageEdge[] } {
  const byName = new Map(metrics.map((metric) => [metric.name, metric]));
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const idByKey = new Map<string, string>();
  const edgeKeys = new Set<string>();

  const nodeFor = (type: LineageNodeType, name: string): string => {
    const key = `${type}:${name}`;
    const existing = idByKey.get(key);
    if (existing) return existing;
    const id = `n${nodes.length}`;
    idByKey.set(key, id);
    nodes.push({ id, type, name, metric: type === 'metric' ? byName.get(name) : undefined, focus: type === 'metric' && name === focusName });
    return id;
  };
  const link = (source: string, target: string) => {
    const key = `${source}->${target}`;
    if (edgeKeys.has(key) || source === target) return;
    edgeKeys.add(key);
    edges.push({ source, target });
  };

  const visited = new Set<string>();
  const walkUpstream = (name: string): string => {
    const metric = byName.get(name);
    const id = nodeFor(metric ? 'metric' : 'missing', name);
    if (!metric || visited.has(name)) return id;
    visited.add(name);
    if (metric.definitionKind === 'aggregation' && metric.table) {
      const tableId = nodeFor('table', metric.table);
      link(tableId, id);
      const schema = schemaForTable(metric.table, schemaNames);
      if (schema) link(nodeFor('schema', schema), tableId);
    }
    for (const input of metric.inputs) {
      link(walkUpstream(input), id);
    }
    return id;
  };

  if (!byName.has(focusName)) return { nodes, edges };
  const focusId = walkUpstream(focusName);
  for (const metric of metrics) {
    if (!metric.archived && metric.inputs.includes(focusName)) {
      link(focusId, nodeFor('metric', metric.name));
    }
  }
  return { nodes, edges };
}
