import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimelineTone = 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'muted';

export interface TimelineItem {
  key: string;
  /** DOM id for the item, so other parts of the page can link to it (`#id`); the linked item is highlighted. */
  anchorId?: string;
  /** The event's kind, drawn as a bubble on the timeline's rail. */
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  tone?: TimelineTone;
  /** Shown before the title - typically who did it (an avatar). */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** A second line under the title. */
  meta?: React.ReactNode;
  /** Pre-formatted time, shown at the inline end. */
  time?: string;
}

export interface TimelineGroup {
  key: string;
  label: string;
  /** Shown beside the label, e.g. the group's item count. */
  sublabel?: string;
  items: readonly TimelineItem[];
}

export interface TimelineProps {
  groups: readonly TimelineGroup[];
  label: string;
  className?: string;
}

const TONES: Record<TimelineTone, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/20',
  success: 'bg-success/10 text-success ring-success/25',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  destructive: 'bg-destructive/10 text-destructive ring-destructive/25',
  info: 'bg-info/10 text-info ring-info/25',
  muted: 'bg-muted text-muted-foreground ring-border',
};

/**
 * A grouped, vertical activity timeline (audit trails, run histories): each group is a labelled
 * run of events on one rail, each event an icon bubble on the rail with its actor, what happened
 * and when. Pure markup with logical properties, so it renders on the server and mirrors in RTL.
 */
export function Timeline({ groups, label, className }: TimelineProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col gap-6', className)} aria-label={label} role="region" data-testid="timeline">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3" aria-label={group.label}>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
            {group.sublabel ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{group.sublabel}</span> : null}
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <ol className="relative flex flex-col gap-1 border-s-2 border-border/70 ms-4">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.key} id={item.anchorId} className="relative scroll-mt-24 rounded-xl ps-7 target:bg-warning/10 target:ring-2 target:ring-warning/40">
                  <span
                    className={cn('absolute -start-[15px] top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-card ring-2', TONES[item.tone ?? 'primary'])}
                    aria-hidden="true"
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                  </span>
                  <div className="flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/50">
                    {item.leading}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <div className="min-w-0 text-sm text-foreground">{item.title}</div>
                        {item.time ? (
                          <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
                            {item.time}
                          </time>
                        ) : null}
                      </div>
                      {item.meta ? <div className="mt-0.5 text-xs text-muted-foreground">{item.meta}</div> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
