import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeroProps {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  /** Small label above the title, e.g. the module name. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Buttons or links shown at the inline end of the title row. */
  actions?: React.ReactNode;
  /** A row under the title - typically a KPI grid. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The top of every page: a tinted panel with the page's icon, title, one-line purpose and its key
 * numbers, so a page opens on what matters instead of a bare heading. Logical properties (`ms`,
 * `text-start`) keep it correct in RTL.
 */
export function PageHero({ icon: Icon, eyebrow, title, description, actions, children, className }: PageHeroProps): React.ReactElement {
  return (
    <section
      data-testid="page-hero"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8',
        'bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.10),transparent_55%),radial-gradient(ellipse_at_bottom_left,hsl(var(--info)/0.08),transparent_50%)]',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {Icon ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[hsl(var(--gradient-to))] text-primary-foreground shadow-md">
              <Icon className="h-6 w-6" />
            </div>
          ) : null}
          <div className="min-w-0 text-start">
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p> : null}
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}
