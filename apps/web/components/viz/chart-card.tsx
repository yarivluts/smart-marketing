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

/** A titled card that frames one chart, diagram or visual list. */
export function ChartCard({ title, description, icon: Icon, actions, footer, children, className, fill }: ChartCardProps): React.ReactElement {
  return (
    <section className={cn('flex flex-col rounded-2xl border border-border bg-card shadow-sm', className)} aria-label={title}>
      <header className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('px-5 py-4', fill && 'flex-1')}>{children}</div>
      {footer ? <footer className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">{footer}</footer> : null}
    </section>
  );
}
