'use client';

import { useTranslations } from 'next-intl';
import { History, Trophy } from 'lucide-react';
import { ChartCard } from '@/components/viz/chart-card';
import { EmptyState } from '@/components/viz/empty-state';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';

export interface WinEventHistoryListProps {
  events: WinEventFeedItem[];
  /** True when more wins exist than were fetched. Measured by the page over-fetching one row past the cap, not inferred from `events.length`. */
  truncated?: boolean;
}

/** Rows shown before the list scrolls, so a busy project's history does not push the rest of the page away. */
const VISIBLE_ROWS_BEFORE_SCROLL = 8;

/**
 * The persisted counterpart to `LiveWinFeed` (KAN-65 follow-up): a plain
 * page-load render of `win_events`, newest-first, capped server-side by
 * `listRecentWinEventsForProject`. Unlike the live feed's `EventSource`
 * subscription, this list survives a closed tab / missed live moment —
 * that's the whole point of it existing alongside the live feed rather than
 * instead of it.
 */
export function WinEventHistoryList({ events, truncated = false }: WinEventHistoryListProps): React.ReactElement {
  const t = useTranslations('WinRules');

  return (
    <ChartCard
      title={t('historyHeading')}
      icon={History}
      fill
      footer={events.length > 0 ? (truncated ? t('historyListCapNoteTruncated', { count: events.length }) : t('historyListCapNote', { count: events.length })) : undefined}
    >
      {events.length === 0 ? (
        <EmptyState icon={Trophy} title={t('historyEmpty')} compact />
      ) : (
        <ul className={events.length > VISIBLE_ROWS_BEFORE_SCROLL ? 'flex max-h-[26rem] flex-col gap-2 overflow-y-auto pe-1' : 'flex flex-col gap-2'}>
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success" aria-hidden="true">
                  <Trophy className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 truncate">{t('feedItem', { winRuleName: event.winRuleName, schemaName: event.schemaName, clientId: event.clientId })}</span>
                {event.winType !== 'generic' ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    {t(`winTypeLabel.${event.winType}`)}
                  </span>
                ) : null}
              </div>
              <time dateTime={event.occurredAt} className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
                {event.occurredAt}
              </time>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
