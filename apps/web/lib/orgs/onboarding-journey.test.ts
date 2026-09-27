import { describe, expect, it } from 'vitest';
import { buildOnboardingJourney, wrapIntoRows } from './onboarding-journey';

describe('wrapIntoRows', () => {
  it('places a chain left to right, wrapping after perRow nodes', () => {
    const nodes = wrapIntoRows(['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id })), 3);
    expect(nodes.map((node) => [node.id, node.column, node.row])).toEqual([
      ['a', 0, 0],
      ['b', 1, 0],
      ['c', 2, 0],
      ['d', 0, 1],
      ['e', 1, 1],
    ]);
  });
});

const text = { label: (step: string) => `L:${step}`, value: (step: string) => (step === 'funnel' ? '3' : undefined) };

describe('buildOnboardingJourney', () => {
  it('draws the six steps in order, coloured by the stored wizard step', () => {
    const { nodes, edges } = buildOnboardingJourney({ step: 'funnel' }, text, { board: '/boards' });
    expect(nodes.map((node) => [node.id, node.status])).toEqual([
      ['start', 'ok'],
      ['pack', 'ok'],
      ['sources', 'ok'],
      ['funnel', 'warn'],
      ['board', 'idle'],
      ['done', 'idle'],
    ]);
    expect(nodes.find((node) => node.id === 'funnel')?.value).toBe('3');
    expect(nodes.find((node) => node.id === 'board')?.href).toBe('/boards');
    expect(edges.map((edge) => [edge.source, edge.target, edge.status, edge.animated])).toEqual([
      ['start', 'pack', 'ok', false],
      ['pack', 'sources', 'ok', false],
      ['sources', 'funnel', 'warn', true],
      ['funnel', 'board', 'idle', false],
      ['board', 'done', 'idle', false],
    ]);
  });

  it('marks only the start as current when the wizard was never opened, and prefixes ids', () => {
    const { nodes, edges } = buildOnboardingJourney({ step: null }, text, {}, 'p1-');
    expect(nodes[0]).toMatchObject({ id: 'p1-start', status: 'warn', label: 'L:start' });
    expect(nodes.slice(1).every((node) => node.status === 'idle')).toBe(true);
    expect(edges[0]).toMatchObject({ source: 'p1-start', target: 'p1-pack' });
  });

  it('marks everything done once the wizard is finished', () => {
    const { nodes } = buildOnboardingJourney({ step: 'done' }, text);
    expect(nodes.every((node) => node.status === 'ok')).toBe(true);
  });
});
