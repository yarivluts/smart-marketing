import { describe, expect, it } from 'vitest';
import { buildMappingFlow, transformMix, type MappingFlowEndpoint, type MappingFlowMapping } from './field-mapping-flow';

const endpoints: MappingFlowEndpoint[] = [
  { id: 'ep1', name: 'Stripe', disabled: false, pendingCount: 3 },
  { id: 'ep2', name: 'Zapier', disabled: false, pendingCount: 1 },
  { id: 'ep3', name: 'Old', disabled: true, pendingCount: 0 },
];

describe('buildMappingFlow', () => {
  it('links each source through its mapping to its target schema', () => {
    const mappings: MappingFlowMapping[] = [
      { id: 'm1', name: 'Stripe to order', kind: 'event', schemaName: 'order_completed', hookEndpointId: 'ep1', disabled: false, ruleCount: 4 },
      { id: 'm2', name: 'Any to visitor', kind: 'entity', schemaName: 'visitor', disabled: true, ruleCount: 2 },
    ];
    const { nodes, edges } = buildMappingFlow(mappings, endpoints, new Set(['event:order_completed']));
    const node = (type: string, name?: string) => nodes.find((candidate) => candidate.type === type && (name === undefined || candidate.name === name))!;

    // The disabled, unused endpoint is left out; the idle Zapier one stays, flagged as unconsumed.
    expect(nodes.filter((candidate) => candidate.type === 'endpoint').map((candidate) => candidate.name)).toEqual(['Stripe', 'Zapier']);
    expect(node('endpoint', 'Zapier').healthy).toBe(false);
    expect(node('endpoint', 'Stripe')).toMatchObject({ count: 3, healthy: true });
    expect(node('any_source').count).toBe(4);
    expect(node('mapping', 'Stripe to order').count).toBe(4);
    expect(node('schema', 'order_completed').healthy).toBe(true);
    expect(node('schema', 'visitor').healthy).toBe(false);

    expect(edges).toContainEqual({ source: node('endpoint', 'Stripe').id, target: node('mapping', 'Stripe to order').id, active: true });
    expect(edges).toContainEqual({ source: node('mapping', 'Any to visitor').id, target: node('schema', 'visitor').id, active: false });
    expect(nodes.every((candidate) => /^f\d+$/.test(candidate.id))).toBe(true);
    // Every live endpoint feeds the "any delivery" step the untied mapping reads from.
    expect(edges).toContainEqual({ source: node('endpoint', 'Zapier').id, target: node('any_source').id, active: false });
    expect(edges).toContainEqual({ source: node('endpoint', 'Stripe').id, target: node('any_source').id, active: false });
  });

  it('marks the endpoint-to-any edges active when an untied mapping is active', () => {
    const { nodes, edges } = buildMappingFlow(
      [{ id: 'm1', name: 'Any', kind: 'event', schemaName: 'signup', disabled: false, ruleCount: 1 }],
      endpoints,
      new Set(['event:signup']),
    );
    const any = nodes.find((candidate) => candidate.type === 'any_source')!;
    expect(edges.filter((edge) => edge.target === any.id).every((edge) => edge.active)).toBe(true);
    expect(nodes.filter((candidate) => candidate.type === 'endpoint').every((candidate) => candidate.healthy)).toBe(true);
  });

  it('shares one schema node between mappings that target it', () => {
    const mappings: MappingFlowMapping[] = [
      { id: 'm1', name: 'A', kind: 'event', schemaName: 'signup', hookEndpointId: 'ep1', disabled: false, ruleCount: 1 },
      { id: 'm2', name: 'B', kind: 'event', schemaName: 'signup', hookEndpointId: 'ep2', disabled: false, ruleCount: 1 },
    ];
    const { nodes } = buildMappingFlow(mappings, endpoints, new Set());
    expect(nodes.filter((candidate) => candidate.type === 'schema')).toHaveLength(1);
  });
});

describe('transformMix', () => {
  it('counts rules per transform', () => {
    expect(transformMix([{ transform: 'rename' }, { transform: 'cast' }, { transform: 'rename' }])).toEqual([
      { transform: 'rename', count: 2 },
      { transform: 'cast', count: 1 },
    ]);
  });
});
