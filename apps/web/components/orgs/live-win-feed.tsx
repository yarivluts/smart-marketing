'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{t('feedHeading')}</h2>
        <span className={connected ? 'text-xs text-green-600' : 'text-xs text-muted-foreground'}>
          {connected ? t('feedConnected') : t('feedConnecting')}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('feedEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
              <span>{t('feedItem', { winRuleName: item.winRuleName, schemaName: item.schemaName, clientId: item.clientId })}</span>
              {item.winType !== 'generic' ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`winTypeLabel.${item.winType}`)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
