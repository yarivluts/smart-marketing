import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  sublabel?: string;
  href?: string;
}

export interface BarListProps {
  items: readonly BarListItem[];
  valueFormatter?: (value: number) => string;
  /** Show at most this many rows; the rest are summarised by `moreLabel`. */
  maxItems?: number;
  moreLabel?: (hidden: number) => string;
  className?: string;
  color?: string;
}

/**
 * A ranked list whose rows carry their own proportional bar - the visual replacement for a two-
 * column "name / count" table. Pure CSS, so it renders on the server and in tests.
 */
export function BarList({ items, valueFormatter = (value) => value.toLocaleString(), maxItems, moreLabel, className, color = 'hsl(var(--primary))' }: BarListProps): React.ReactElement {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const shown = maxItems ? sorted.slice(0, maxItems) : sorted;
  const hidden = sorted.length - shown.length;
  const max = Math.max(1, ...shown.map((item) => item.value));
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="bar-list">
      <ul className="flex flex-col gap-1.5">
        {shown.map((item) => {
          const row = (
            <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg px-3 py-2">
              <div className="absolute inset-y-0 start-0 rounded-lg opacity-15" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color }} aria-hidden="true" />
              <span className="relative min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                {item.sublabel ? <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span> : null}
              </span>
              <span className="relative shrink-0 text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                {valueFormatter(item.value)}
              </span>
            </div>
          );
          return (
            <li key={item.key}>
              {item.href ? (
                <Link href={item.href} className="block rounded-lg transition-colors hover:bg-muted/60">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && moreLabel ? <p className="px-3 text-xs text-muted-foreground">{moreLabel(hidden)}</p> : null}
    </div>
  );
}
