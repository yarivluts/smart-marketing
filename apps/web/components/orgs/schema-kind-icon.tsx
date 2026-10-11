import * as React from 'react';
import { Database, Gauge, UserRound, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const KIND_ICONS: Record<string, LucideIcon> = { event: Zap, entity: UserRound, measure: Gauge };

/** Token-based tint per record kind, shared by every data page so a kind always reads the same colour. */
const KIND_TINT: Record<string, string> = {
  event: 'bg-primary/10 text-primary',
  entity: 'bg-info/10 text-info',
  measure: 'bg-success/10 text-success',
};

export function schemaKindIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? Database;
}

/** A small tinted tile with the icon for an ingest record kind (event / entity / measure). */
export function SchemaKindIcon({ kind, size = 'md', className }: { kind: string; size?: 'sm' | 'md'; className?: string }): React.ReactElement {
  const Icon = schemaKindIcon(kind);
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-lg', KIND_TINT[kind] ?? 'bg-muted text-muted-foreground', size === 'sm' ? 'h-6 w-6' : 'h-9 w-9', className)}
      aria-hidden="true"
      data-kind={kind}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  );
}
