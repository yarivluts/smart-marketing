/**
 * Graph shaping for the field-mappings page: where inbound payloads come from (a hook endpoint, or
 * any delivery when a mapping is not tied to one), which mapping turns them into records, and which
 * registered schema those records must satisfy. Pure over data the page already loads.
 */

export interface MappingFlowMapping {
  id: string;
  name: string;
  kind: string;
  schemaName: string;
  hookEndpointId?: string;
  disabled: boolean;
  ruleCount: number;
}

export interface MappingFlowEndpoint {
  id: string;
  name: string;
  disabled: boolean;
  /** Deliveries from this endpoint still waiting in the review queue. */
  pendingCount: number;
}

export type MappingFlowNodeType = 'endpoint' | 'any_source' | 'mapping' | 'schema';

export interface MappingFlowNode {
  /** Index-based, so a user-chosen name never ends up in an accessible label. */
  id: string;
  type: MappingFlowNodeType;
  name: string;
  /** endpoint: its id; mapping: its id; schema: `kind:name`. */
  refId: string;
  kind?: string;
  /** endpoint: pending deliveries; mapping: rule count. */
  count: number;
  disabled: boolean;
  /** schema: whether an active version is registered; endpoint: whether any active mapping consumes it. */
  healthy: boolean;
}

export interface MappingFlowEdge {
  source: string;
  target: string;
  active: boolean;
}

export function buildMappingFlow(
  mappings: readonly MappingFlowMapping[],
  endpoints: readonly MappingFlowEndpoint[],
  activeSchemaKeys: ReadonlySet<string>,
): { nodes: MappingFlowNode[]; edges: MappingFlowEdge[] } {
  const nodes: MappingFlowNode[] = [];
  const edges: MappingFlowEdge[] = [];
  const idByKey = new Map<string, string>();
  const add = (key: string, node: Omit<MappingFlowNode, 'id'>): string => {
    const existing = idByKey.get(key);
    if (existing) return existing;
    const id = `f${nodes.length}`;
    idByKey.set(key, id);
    nodes.push({ id, ...node });
    return id;
  };

  const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const consumed = new Set(mappings.filter((mapping) => !mapping.disabled && mapping.hookEndpointId).map((mapping) => mapping.hookEndpointId!));
  const anyActiveUntied = mappings.some((mapping) => !mapping.disabled && !mapping.hookEndpointId);
  for (const endpoint of endpoints) {
    if (endpoint.disabled && !mappings.some((mapping) => mapping.hookEndpointId === endpoint.id)) continue;
    add(`endpoint:${endpoint.id}`, {
      type: 'endpoint',
      name: endpoint.name,
      refId: endpoint.id,
      count: endpoint.pendingCount,
      disabled: endpoint.disabled,
      healthy: consumed.has(endpoint.id) || anyActiveUntied,
    });
  }

  for (const mapping of mappings) {
    const endpoint = mapping.hookEndpointId ? endpointById.get(mapping.hookEndpointId) : undefined;
    const sourceId = endpoint
      ? add(`endpoint:${endpoint.id}`, { type: 'endpoint', name: endpoint.name, refId: endpoint.id, count: endpoint.pendingCount, disabled: endpoint.disabled, healthy: true })
      : add('any', { type: 'any_source', name: '', refId: '', count: endpoints.reduce((sum, candidate) => sum + candidate.pendingCount, 0), disabled: false, healthy: true });
    const mappingId = add(`mapping:${mapping.id}`, { type: 'mapping', name: mapping.name, refId: mapping.id, count: mapping.ruleCount, disabled: mapping.disabled, healthy: !mapping.disabled });
    const schemaKey = `${mapping.kind}:${mapping.schemaName}`;
    const schemaId = add(`schema:${schemaKey}`, { type: 'schema', name: mapping.schemaName, refId: schemaKey, kind: mapping.kind, count: 0, disabled: false, healthy: activeSchemaKeys.has(schemaKey) });
    edges.push({ source: sourceId, target: mappingId, active: !mapping.disabled && !(endpoint?.disabled ?? false) });
    edges.push({ source: mappingId, target: schemaId, active: !mapping.disabled });
  }

  // A mapping not tied to an endpoint can be applied to a delivery from any of them, so every live
  // endpoint feeds the "any delivery" step - otherwise those endpoints would float unconnected.
  const anyId = idByKey.get('any');
  if (anyId) {
    for (const endpoint of endpoints) {
      const endpointId = idByKey.get(`endpoint:${endpoint.id}`);
      if (endpointId && !endpoint.disabled) edges.push({ source: endpointId, target: anyId, active: anyActiveUntied });
    }
  }
  return { nodes, edges };
}

/** How many rules use each transform, busiest first. */
export function transformMix(rules: readonly { transform: string }[]): { transform: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(rule.transform, (counts.get(rule.transform) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([transform, count]) => ({ transform, count }));
}
