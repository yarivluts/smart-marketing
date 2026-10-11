import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressRingProps {
  /** 0-100; values outside the range are clamped. */
  percent: number;
  /** Accessible name, e.g. "4 of 6 requirements connected". */
  label: string;
  /** Text in the middle of the ring; defaults to the rounded percentage. */
  centerValue?: string;
  centerLabel?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}

/**
 * A single-value completion ring (pure SVG, server-safe) - for "how much of this is done", where a
 * donut's share-of-total framing would be wrong. The arc starts at twelve o'clock and runs clockwise.
 */
export function ProgressRing({
  percent,
  label,
  centerValue,
  centerLabel,
  size = 112,
  strokeWidth = 10,
  color = 'hsl(var(--primary))',
  className,
}: ProgressRingProps): React.ReactElement {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      data-testid="progress-ring"
      data-percent={Math.round(clamped)}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-xl font-bold tabular-nums text-foreground" dir="ltr">
          {centerValue ?? `${Math.round(clamped)}%`}
        </span>
        {centerLabel ? <span className="text-[11px] text-muted-foreground">{centerLabel}</span> : null}
      </div>
    </div>
  );
}
