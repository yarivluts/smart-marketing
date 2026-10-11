import * as React from 'react';
import { cn } from '@/lib/utils';
import { STATUS_TOKENS, type VizStatus } from '@/components/viz/palette';

export interface FeedTimelineItem {
  id: string;
  tone: VizStatus;
  title: string;
  /** Shown at the inline end of the title row, e.g. an amount. */
  aside?: string;
  /** Extra lines under the title; a line with `emphasis` renders in the tone's colour. */
  lines?: readonly { text: string; emphasis?: boolean; ltr?: boolean }[];
  /** Small trailing metadata, e.g. landed time and ids. */
  meta?: string;
}

export interface FeedTimelineGroup {
  key: string;
  label: string;
  items: readonly FeedTimelineItem[];
}

export interface FeedTimelineProps {
  groups: readonly FeedTimelineGroup[];
  label: string;
  className?: string;
}

/**
 * A day-grouped vertical timeline for record feeds: a rail with one tone-coloured dot per record, so
 * failures and refunds stand out from routine charges at a glance. Pure markup (renders on the
 * server); logical properties keep the rail on the reading-start side in RTL.
 */
export function FeedTimeline({ groups, label, className }: FeedTimelineProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col gap-5', className)} aria-label={label} role="list" data-testid="feed-timeline">
      {groups.map((group) => (
        <div key={group.key} role="listitem" className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
          <ol className="relative flex flex-col gap-2 border-s-2 border-border ps-5">
            {group.items.map((item) => {
              const tone = STATUS_TOKENS[item.tone];
              return (
                <li key={item.id} className="relative">
                  <span className={cn('absolute -start-[27px] top-3 h-3 w-3 rounded-full ring-4 ring-card', tone.dot)} aria-hidden="true" />
                  <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', tone.soft, tone.text)}>{item.title}</span>
                      {item.aside ? (
                        <span className="text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                          {item.aside}
                        </span>
                      ) : null}
                    </div>
                    {item.lines?.map((line, index) => (
                      <span key={index} className={cn(line.emphasis ? tone.text : 'text-muted-foreground', 'break-words')} dir={line.ltr ? 'ltr' : undefined}>
                        {line.text}
                      </span>
                    ))}
                    {item.meta ? <span className="text-xs text-muted-foreground/80">{item.meta}</span> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
