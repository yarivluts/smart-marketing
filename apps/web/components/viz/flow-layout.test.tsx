import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { layoutFlow } from './flow-diagram';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe('layoutFlow with pinned cells', () => {
  it('uses a node\'s own column/row when both are set, and depth layout otherwise', () => {
    const nodes = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C', column: 0, row: 1 },
      { id: 'd', label: 'D', column: 3 },
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ];
    const positions = layoutFlow(nodes, edges);
    expect(positions.get('a')).toEqual({ column: 0, row: 0 });
    expect(positions.get('b')).toEqual({ column: 1, row: 0 });
    expect(positions.get('c')).toEqual({ column: 0, row: 1 });
    // Only a column, no row: not pinned, so it keeps its depth position.
    expect(positions.get('d')).toEqual({ column: 3, row: 0 });
  });
});
