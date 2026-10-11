import * as React from 'react';
import { cn } from '@/lib/utils';

const ENV_TINT: Record<string, string> = {
  prod: 'border-destructive/30 bg-destructive/10 text-destructive',
  staging: 'border-warning/40 bg-warning/10 text-warning',
  dev: 'border-info/30 bg-info/10 text-info',
};

/**
 * A small coloured pill naming an environment - prod reads hot, dev cool - so a key or endpoint's
 * blast radius is visible at a glance. `label` is the already-translated name.
 */
export function EnvironmentPill({ name, label, className }: { name: string | undefined; label: string; className?: string }): React.ReactElement {
  return (
    <span
      className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', ENV_TINT[name ?? ''] ?? 'border-border bg-muted text-muted-foreground', className)}
      data-environment={name}
    >
      {label}
    </span>
  );
}
