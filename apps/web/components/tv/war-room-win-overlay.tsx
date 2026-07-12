'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';
import { tvWinFeedUrl } from '@/lib/tv/tv-client';
import { playWinChime } from '@/lib/tv/win-chime';
import { ConfettiBurst } from '@/components/tv/confetti-burst';

export interface WarRoomWinOverlayProps {
  deviceToken: string;
  reducedMotion: boolean;
}

/** How long a win's toast + confetti burst stays on screen before clearing — long enough to read, short enough that a busy war-room's wins don't visually pile up. */
const CELEBRATION_DURATION_MS = 4500;

/** How long to wait before opening a fresh `EventSource` after one hard-fails (see the `onerror` handler below) — not exponential backoff, since a revoked pairing (the most likely hard-failure cause) is itself detected and this whole component unmounted within `tv-app.tsx`'s own 90s claimed-poll cadence, bounding how long a fixed-interval retry loop can possibly run for. */
const RECONNECT_DELAY_MS = 5000;

/**
 * The TV's own live win feed subscriber (KAN-67 AC: "win feed overlay,
 * confetti + sound per win type"): opens the same `EventSource`-based SSE
 * stream `live-win-feed.tsx` (KAN-65's admin-page panel) does, just against
 * the session-less `tv-pairing/win-feed` route instead — see that
 * component's own doc comment for the transport/reconnect rationale, which
 * applies identically here. `EventSource`'s native auto-reconnect (using
 * `Last-Event-ID`, see `win-feed-stream.ts`) handles a dropped-mid-stream
 * connection on its own, but per the WHATWG spec a *hard* failure — the
 * server rejecting the request outright, e.g. a non-200/non-event-stream
 * response — leaves `readyState` at `CLOSED` with no further attempt of its
 * own ("fail the connection", not "reestablish the connection"). Unlike
 * `live-win-feed.tsx` (a human is looking at the admin page and can refresh
 * it), a war-room TV runs unattended for the AC's full 24h, so this
 * component's own `onerror` handler explicitly reopens the connection after
 * `RECONNECT_DELAY_MS` whenever that happens, rather than silently going
 * quiet on wins for the rest of the session.
 *
 * Only ever shows the *current* win as a toast, not an accumulating list
 * (that's `live-win-feed.tsx`'s job on the admin page) — a war-room screen
 * celebrates the win that just happened, one at a time, clearing itself via
 * a single `setTimeout` that's always cleared on unmount/rewrite so a long-
 * running TV never accumulates orphaned timers no matter how many wins fire
 * over a day (the same "bounded, not merely capped" leak-prevention posture
 * `ConfettiBurst`'s own doc comment documents for its particle DOM nodes).
 */
export function WarRoomWinOverlay({ deviceToken, reducedMotion }: WarRoomWinOverlayProps): React.ReactElement | null {
  const t = useTranslations('WinRules');
  const tTv = useTranslations('TvMode');
  const [activeWin, setActiveWin] = useState<WinEventFeedItem | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource;

    function connect(): void {
      source = new EventSource(tvWinFeedUrl(deviceToken));
      source.addEventListener('win', (event) => {
        const item = JSON.parse((event as MessageEvent<string>).data) as WinEventFeedItem;
        setActiveWin(item);
        playWinChime(item.winType);
        if (clearTimerRef.current) {
          clearTimeout(clearTimerRef.current);
        }
        clearTimerRef.current = setTimeout(() => setActiveWin(null), CELEBRATION_DURATION_MS);
      });
      source.onerror = () => {
        if (!cancelled && source.readyState === EventSource.CLOSED) {
          reconnectTimer = setTimeout(() => {
            if (!cancelled) {
              connect();
            }
          }, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      source.close();
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [deviceToken]);

  if (!activeWin) {
    return null;
  }

  return (
    <>
      <ConfettiBurst reducedMotion={reducedMotion} />
      <div className="fixed inset-x-0 top-8 flex justify-center">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-background/95 px-8 py-4 text-center shadow-2xl">
          <span className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {tTv('winOverlayHeading')}
          </span>
          <span className="text-2xl font-bold">
            {t('feedItem', { winRuleName: activeWin.winRuleName, schemaName: activeWin.schemaName, clientId: activeWin.clientId })}
          </span>
          {activeWin.winType !== 'generic' ? (
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
              {t(`winTypeLabel.${activeWin.winType}`)}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
