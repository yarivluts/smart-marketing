import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ComparisonBar {
  key: string;
  label: string;
  value: number;
  /** The value as shown beside the bar, pre-formatted. */
  display: string;
  /** A theme token colour for the fill; defaults to the primary colour. */
  color?: string;
}

export interface ComparisonBarsProps {
  bars: readonly ComparisonBar[];
  /** The value a full-width bar stands for. Every bar shares this scale, so a shift reads as a length change. */
  max: number;
  /** Accessible summary, e.g. "Baseline 62, current 48". The bars themselves are decorative. */
  label: string;
  className?: string;
}

/**
 * Two or three values on one shared track - a before/after or baseline/current pair - so the size of
 * a change is visible at a glance instead of being read off two numbers. Pure CSS, server-safe.
 */
export function ComparisonBars({ bars, max, label, className }: ComparisonBarsProps): React.ReactElement {
  const scale = max > 0 ? max : 1;
  return (
    <div className={cn('flex flex-col gap-1.5', className)} role="img" aria-label={label} data-testid="comparison-bars">
      {bars.map((bar) => (
        <div key={bar.key} className="flex items-center gap-2" aria-hidden="true">
          <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{bar.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, (bar.value / scale) * 100))}%`, backgroundColor: bar.color ?? 'hsl(var(--primary))' }}
            />
          </div>
          <span className="w-12 shrink-0 text-end text-xs font-medium tabular-nums text-foreground" dir="ltr">
            {bar.display}
          </span>
        </div>
      ))}
    </div>
  );
}
