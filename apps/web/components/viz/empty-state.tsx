import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * What a section shows when it has nothing yet: an icon, what is missing, and the one step that
 * fills it - instead of a lone grey sentence.
 */
export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps): React.ReactElement {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {Icon ? (
        <div className={cn('flex items-center justify-center rounded-2xl bg-primary/10 text-primary', compact ? 'h-10 w-10' : 'h-14 w-14')}>
          <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
        </div>
      ) : null}
      <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
