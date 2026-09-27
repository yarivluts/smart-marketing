'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Radio, Trophy } from 'lucide-react';
import { ChartCard } from '@/components/viz/chart-card';
import { EmptyState } from '@/components/viz/empty-state';
import { cn } from '@/lib/utils';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';

export interface LiveWinFeedProps {
  orgId: string;
  projectId: string;
}

/** Caps the feed's own rendered list — this is a live view, not a historical browse (that's `listRecentWinEventsForProject`'s page-load render, above this panel). */
const MAX_FEED_ITEMS = 20;

/**
 * KAN-65's live win feed panel: subscribes to `.../win-rules/feed` (a
 * Server-Sent Events stream, this story's buildable-today stand-in for a
 * WebSocket push channel — see that route's own doc comment) via the
 * browser's native `EventSource`, which auto-reconnects on its own if the
 * connection drops. New wins are prepended, newest-first, capped at
 * {@link MAX_FEED_ITEMS}.
 */
export function LiveWinFeed({ orgId, projectId }: LiveWinFeedProps): React.ReactElement {
  const t = useTranslations('WinRules');
  const [items, setItems] = useState<WinEventFeedItem[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/orgs/${orgId}/projects/${projectId}/win-rules/feed`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('win', (event) => {
      const item = JSON.parse((event as MessageEvent<string>).data) as WinEventFeedItem;
      setItems((current) => [item, ...current].slice(0, MAX_FEED_ITEMS));
    });
    return () => source.close();
  }, [orgId, projectId]);

  return (
    <ChartCard
      title={t('feedHeading')}
      icon={Radio}
      fill
      actions={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'animate-pulse bg-success' : 'bg-muted-foreground/60')} aria-hidden="true" />
          {connected ? t('feedConnected') : t('feedConnecting')}
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={Radio} title={t('feedEmpty')} compact />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success" aria-hidden="true">
                <Trophy className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 truncate">{t('feedItem', { winRuleName: item.winRuleName, schemaName: item.schemaName, clientId: item.clientId })}</span>
              {item.winType !== 'generic' ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {t(`winTypeLabel.${item.winType}`)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
