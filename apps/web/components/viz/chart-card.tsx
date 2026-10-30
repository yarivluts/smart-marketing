import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChartCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Stretch the body to fill the card's height, for charts in a grid row. */
  fill?: boolean;
}

/** A titled card that frames one chart, diagram or visual list (the Pastel Pulse card). */
export function ChartCard({ title, description, icon: Icon, actions, footer, children, className, fill }: ChartCardProps): React.ReactElement {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl bg-pp-surface-container-lowest text-pp-on-surface shadow-pp-candy',
        className,
      )}
      aria-label={title}
    >
      <header className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:px-pp-lg sm:pt-pp-lg">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pp-primary-fixed text-pp-primary">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="font-pp-display text-pp-headline-md text-pp-on-surface">{title}</h2>
            {description ? <p className="mt-0.5 text-pp-body-sm text-pp-on-surface-variant">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
      </header>
      <div className={cn('p-4 pt-3 sm:p-pp-lg sm:pt-pp-md', fill && 'flex-1')}>{children}</div>
      {footer ? (
        <footer className="border-t border-pp-outline-variant/30 px-4 py-3 text-pp-body-sm text-pp-on-surface-variant sm:px-pp-lg">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
