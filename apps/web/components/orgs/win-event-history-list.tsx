'use client';

import { useTranslations } from 'next-intl';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';

export interface WinEventHistoryListProps {
  events: WinEventFeedItem[];
}

/**
 * The persisted counterpart to `LiveWinFeed` (KAN-65 follow-up): a plain
 * page-load render of `win_events`, newest-first, capped server-side by
 * `listRecentWinEventsForProject`. Unlike the live feed's `EventSource`
 * subscription, this list survives a closed tab / missed live moment —
 * that's the whole point of it existing alongside the live feed rather than
 * instead of it.
 */
export function WinEventHistoryList({ events }: WinEventHistoryListProps): React.ReactElement {
  const t = useTranslations('WinRules');

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('historyHeading')}</h2>
      {events.length === 0 ? (
        <p className="text-muted-foreground">{t('historyEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{t('feedItem', { winRuleName: event.winRuleName, schemaName: event.schemaName, clientId: event.clientId })}</span>
                {event.winType !== 'generic' ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t(`winTypeLabel.${event.winType}`)}
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">{event.occurredAt}</span>
            </li>
          ))}
        </ul>
      )}
      {events.length > 0 ? <p className="text-xs text-muted-foreground">{t('historyListCapNote', { count: events.length })}</p> : null}
    </section>
  );
}
