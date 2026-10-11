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
 * The top of every page, in the Pastel Pulse look: the eyebrow as a lavender pill, a large display
 * title, the one-line purpose, then the page's key numbers. It sits on the page surface (no card),
 * like the Stitch page header. Logical properties (`ms`, `text-start`) keep it correct in RTL.
 */
export function PageHero({ icon: Icon, eyebrow, title, description, actions, children, className }: PageHeroProps): React.ReactElement {
  return (
    <section data-testid="page-hero" className={cn('flex flex-col gap-pp-lg', className)}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-start gap-pp-md">
          {Icon ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pp-primary-fixed text-pp-primary shadow-sm">
              <Icon className="h-6 w-6" />
            </div>
          ) : null}
          <div className="min-w-0 text-start">
            {eyebrow ? (
              <span className="mb-1 inline-flex rounded-full bg-pp-primary-fixed px-2.5 py-0.5 text-pp-label-sm uppercase tracking-wider text-pp-on-primary-fixed">
                {eyebrow}
              </span>
            ) : null}
            <h1 className="font-pp-display text-pp-headline-xl-mobile tracking-tight text-pp-on-surface md:text-pp-headline-xl">
              {title}
            </h1>
            {description ? <p className="mt-1 max-w-3xl text-pp-body-md text-pp-on-surface-variant">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      {children ? <div>{children}</div> : null}
    </section>
  );
}
