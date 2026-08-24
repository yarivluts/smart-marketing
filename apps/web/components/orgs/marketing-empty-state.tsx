'use client';

import { type LucideIcon } from 'lucide-react';

/**
 * Shared empty-state card shown on marketing intelligence pages in
 * non-demo (real) projects — displayed until the user connects a live
 * data source or ad channel.
 */
export function MarketingEmptyState({
  Icon,
  heading,
  description,
  ctaLabel,
}: {
  Icon: LucideIcon;
  heading: string;
  description: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-border bg-card py-20 px-8 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <Icon className="h-8 w-8" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-foreground">{heading}</h2>
        <p className="max-w-md text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary">
        <span>{ctaLabel}</span>
      </div>
    </div>
  );
}
