import * as React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A folded section of the Plan step: its title and a one-line state ("12 keywords chosen") until the
 * person opens it. Keeps the main path - plan, script, image ideas - on screen instead of under
 * every research tool at once.
 */
export function PlanSection({ title, state, children, testId, defaultOpen = false }: { title: string; state: string; children: React.ReactNode; testId?: string; /** Opened on arrival, when a link sent the person here to use it. */ defaultOpen?: boolean }): React.ReactElement {
  return (
    <details className="group rounded-2xl border border-border bg-card shadow-sm" data-testid={testId} open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{state}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
  );
}
