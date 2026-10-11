import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SparklineProps {
  values: readonly (number | null)[];
  className?: string;
  /** Accessible summary, e.g. "7-day trend". The line itself is decorative. */
  label?: string;
  color?: string;
}

/**
 * A tiny inline trend line, pure SVG (no chart runtime) so it can sit in a KPI card or table cell.
 * Gaps (null) break the line instead of being drawn as zero.
 */
export function Sparkline({ values, className, label, color = 'hsl(var(--primary))' }: SparklineProps): React.ReactElement | null {
  const numeric = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (numeric.length < 2) {
    return null;
  }
  const max = Math.max(...numeric);
  const min = Math.min(...numeric);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);

  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${(index * step).toFixed(2)},${(28 - ((value - min) / span) * 24).toFixed(2)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn('h-8 w-full overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-testid="sparkline"
    >
      {segments.map((points) => (
        <polyline key={points} points={points} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
