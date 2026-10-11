import * as React from 'react';
import { cn } from '@/lib/utils';

export interface HeatmapRow {
  key: string;
  label: string;
  /** Shown under the label, e.g. a cohort's size. */
  sublabel?: string;
  /** One value per column; null for "no value" (not yet reached, or not applicable). */
  cells: readonly (number | null)[];
}

export interface HeatmapProps {
  columns: readonly string[];
  rows: readonly HeatmapRow[];
  /** Upper end of the colour scale; defaults to the largest value. Ratios pass 1. */
  max?: number;
  valueFormatter?: (value: number) => string;
  label: string;
  /** Header over the row labels. */
  rowHeader?: string;
  className?: string;
}

/**
 * A colour-scaled grid (cohort retention, day-by-hour activity). Each cell's intensity is its value
 * over the scale's maximum, drawn from the primary token so it follows the theme; empty cells are
 * hatched rather than coloured as zero. A real <table>, so it is readable without colour.
 */
export function Heatmap({ columns, rows, max, valueFormatter = (value) => value.toLocaleString(), label, rowHeader, className }: HeatmapProps): React.ReactElement {
  const values = rows.flatMap((row) => row.cells).filter((value): value is number => value !== null && Number.isFinite(value));
  const scaleMax = max ?? Math.max(1e-9, ...values);
  return (
    <div className={cn('overflow-x-auto', className)} data-testid="heatmap">
      <table className="w-full border-separate border-spacing-1 text-xs" aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-start font-medium text-muted-foreground">
              {rowHeader}
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-2 py-1 text-center font-medium text-muted-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-start font-medium text-foreground">
                {row.label}
                {row.sublabel ? <span className="block text-[11px] font-normal text-muted-foreground">{row.sublabel}</span> : null}
              </th>
              {columns.map((column, index) => {
                const value = row.cells[index] ?? null;
                if (value === null || !Number.isFinite(value)) {
                  return <td key={column} className="h-10 min-w-14 rounded-md bg-[repeating-linear-gradient(45deg,hsl(var(--muted)),hsl(var(--muted))_4px,transparent_4px,transparent_8px)]" />;
                }
                const intensity = Math.max(0, Math.min(1, value / scaleMax));
                return (
                  <td
                    key={column}
                    title={`${row.label} · ${column}: ${valueFormatter(value)}`}
                    className={cn('h-10 min-w-14 rounded-md text-center font-semibold tabular-nums transition-transform hover:scale-105', intensity > 0.55 ? 'text-primary-foreground' : 'text-foreground')}
                    style={{ backgroundColor: `hsl(var(--primary) / ${(0.08 + intensity * 0.82).toFixed(3)})` }}
                    dir="ltr"
                  >
                    {valueFormatter(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
