'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { STATUS_TOKENS, type VizStatus } from './palette';

export interface FlowNodeSpec {
  id: string;
  label: string;
  sublabel?: string;
  /** The node's headline number, pre-formatted. */
  value?: string;
  status?: VizStatus;
  href?: string;
  /**
   * Pins the node to a grid cell instead of the automatic column-by-depth layout - e.g. to wrap a
   * long linear journey onto two rows so it stays readable. Used only when both are set.
   */
  column?: number;
  row?: number;
}

export interface FlowEdgeSpec {
  source: string;
  target: string;
  label?: string;
  /** Animated dashes - use for streams that are flowing now. */
  animated?: boolean;
  status?: VizStatus;
}

export interface FlowDiagramProps {
  nodes: readonly FlowNodeSpec[];
  edges: readonly FlowEdgeSpec[];
  label: string;
  height?: number;
  className?: string;
}

const COLUMN_GAP = 240;
const ROW_GAP = 104;

/**
 * Places nodes in columns by their longest path from a source (a node with no incoming edge), and
 * spreads each column's nodes vertically around the middle. Deterministic and dependency-free, so
 * the same graph always renders the same way; cycles are cut at the first revisit.
 */
export function layoutFlow(nodes: readonly FlowNodeSpec[], edges: readonly FlowEdgeSpec[]): Map<string, { column: number; row: number }> {
  const incoming = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    incoming.get(edge.target)?.push(edge.source);
  }
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
  const columns = new Map<number, string[]>();
  for (const node of nodes) {
    const column = depthOf(node.id);
    columns.set(column, [...(columns.get(column) ?? []), node.id]);
  }
  const tallest = Math.max(1, ...[...columns.values()].map((ids) => ids.length));
  const positions = new Map<string, { column: number; row: number }>();
  for (const [column, ids] of columns) {
    const offset = (tallest - ids.length) / 2;
    ids.forEach((id, index) => positions.set(id, { column, row: offset + index }));
  }
  for (const node of nodes) {
    if (node.column !== undefined && node.row !== undefined) {
      positions.set(node.id, { column: node.column, row: node.row });
    }
  }
  return positions;
}

type FlowNodeData = FlowNodeSpec & { rtl: boolean } & Record<string, unknown>;

function FlowNodeCard({ data }: NodeProps<Node<FlowNodeData>>): React.ReactElement {
  const tokens = STATUS_TOKENS[data.status ?? 'idle'];
  return (
    <div
      className={cn(
        'w-48 rounded-xl border border-border bg-card px-3 py-2.5 text-start shadow-sm ring-2 transition-shadow',
        tokens.ring,
        data.href && 'cursor-pointer hover:shadow-md',
      )}
      dir={data.rtl ? 'rtl' : 'ltr'}
      data-testid={`flow-node-${data.id}`}
    >
      <Handle type="target" position={data.rtl ? Position.Right : Position.Left} className="!h-2 !w-2 !border-0 !bg-border" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{data.label}</span>
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tokens.dot)} aria-hidden="true" />
      </div>
      {data.value ? (
        <div className="mt-1 text-lg font-bold tabular-nums text-foreground" dir="ltr">
          {data.value}
        </div>
      ) : null}
      {data.sublabel ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{data.sublabel}</div> : null}
      <Handle type="source" position={data.rtl ? Position.Left : Position.Right} className="!h-2 !w-2 !border-0 !bg-border" />
    </div>
  );
}

const nodeTypes = { card: FlowNodeCard };

const EDGE_COLOR: Record<VizStatus, string> = {
  ok: 'hsl(var(--success))',
  warn: 'hsl(var(--warning))',
  error: 'hsl(var(--destructive))',
  idle: 'hsl(var(--muted-foreground) / 0.5)',
};

/**
 * An interactive flow diagram (pan, zoom, click-through) for pipelines, funnels and automations.
 * Scroll-to-zoom is off so the page keeps scrolling; the controls zoom instead. A node with an
 * `href` navigates there. The same nodes and edges are listed in a visually hidden list for
 * screen readers.
 */
export function FlowDiagram({ nodes, edges, label, height = 320, className }: FlowDiagramProps): React.ReactElement {
  const rtl = useLocale() === 'he';
  const router = useRouter();
  const positions = React.useMemo(() => layoutFlow(nodes, edges), [nodes, edges]);
  const maxColumn = Math.max(0, ...[...positions.values()].map((position) => position.column));

  const flowNodes: Node<FlowNodeData>[] = nodes.map((node) => {
    const position = positions.get(node.id) ?? { column: 0, row: 0 };
    const column = rtl ? maxColumn - position.column : position.column;
    return {
      id: node.id,
      type: 'card',
      position: { x: column * COLUMN_GAP, y: position.row * ROW_GAP },
      data: { ...node, rtl },
      draggable: false,
      connectable: false,
    };
  });
  const flowEdges: Edge[] = edges.map((edge) => {
    const color = EDGE_COLOR[edge.status ?? 'idle'];
    return {
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.animated,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      labelStyle: { fontSize: 11, fill: 'hsl(var(--foreground))' },
      labelBgStyle: { fill: 'hsl(var(--card))' },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <figure className={cn('w-full', className)} aria-label={label} data-testid="flow-diagram">
      <div style={{ height }} className="overflow-hidden rounded-xl border border-border bg-muted/20" aria-hidden="true">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.5}
          zoomOnScroll={false}
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_event, node) => {
            const href = byId.get(node.id)?.href;
            if (href) router.push(href);
          }}
        >
          <Background gap={20} size={1} color="hsl(var(--border))" />
          <Controls showInteractive={false} position={rtl ? 'bottom-left' : 'bottom-right'} />
        </ReactFlow>
      </div>
      <ul className="sr-only">
        {edges.map((edge) => (
          <li key={`${edge.source}->${edge.target}`}>
            {byId.get(edge.source)?.label ?? edge.source} → {byId.get(edge.target)?.label ?? edge.target}
            {edge.label ? `: ${edge.label}` : ''}
          </li>
        ))}
      </ul>
    </figure>
  );
}
