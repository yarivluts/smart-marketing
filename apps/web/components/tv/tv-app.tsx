'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  fetchTvPairingStatus,
  fetchTvRotationManifest,
  requestTvPairing,
  type TvRotationManifest,
} from '@/lib/tv/tv-client';
import { TvPairingScreen } from '@/components/tv/tv-pairing-screen';
import { TvRotationScreen } from '@/components/tv/tv-rotation-screen';

/** Only ever written *after* a pairing is claimed (see this component's own doc comment) — a page reload while still on the pairing screen just mints a fresh code rather than trying to recover a code this browser instance never persisted. */
const STORAGE_KEY = 'growthos-tv-device-token';

const PENDING_POLL_INTERVAL_MS = 4000;
/** Long enough that 24h of continuous polling is a few hundred requests, not tens of thousands (AC: "runs 24h ... without leak/crash") — short enough that an admin revoking this TV, or editing its rotation/board config, takes effect within about a minute and a half rather than requiring a manual reload. */
const CLAIMED_POLL_INTERVAL_MS = 90000;

type TvAppPhase = 'loading' | 'pairing' | 'claimed' | 'error';

/**
 * The war-room TV's full client-side state machine (KAN-67, E12.3): mint (or
 * resume) a pairing, show the code and poll until an admin claims it, then
 * hand off to the fullscreen rotation. Deliberately owns every long-lived
 * timer itself (rather than delegating to child effects) so there is exactly
 * one poll loop running at any moment — the `useEffect` cleanup on every
 * transition (`deviceToken` change, unmount) is what keeps this AC's "no
 * leak over 24h" promise: no interval or `EventSource` ever outlives the
 * phase it was created for.
 */
export function TvApp(): React.ReactElement {
  const t = useTranslations('TvMode');
  const [phase, setPhase] = useState<TvAppPhase>('loading');
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [manifest, setManifest] = useState<TvRotationManifest | null>(null);
  const [resetCounter, setResetCounter] = useState(0);

  // Ensures a device token exists — resumes an already-claimed pairing from
  // `localStorage`, or mints a brand-new one. Re-runs whenever `resetCounter`
  // changes, which the poll effect below bumps after a revoked/expired
  // token to start over cleanly.
  useEffect(() => {
    let cancelled = false;
    async function ensureDeviceToken(): Promise<void> {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (stored) {
        if (!cancelled) {
          setDeviceToken(stored);
        }
        return;
      }
      try {
        const result = await requestTvPairing();
        if (cancelled) {
          return;
        }
        setCode(result.code);
        setPhase('pairing');
        setDeviceToken(result.deviceToken);
      } catch {
        if (!cancelled) {
          setPhase('error');
        }
      }
    }
    void ensureDeviceToken();
    return () => {
      cancelled = true;
    };
  }, [resetCounter]);

  useEffect(() => {
    if (!deviceToken) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Tracked locally (not via a ref synced on render, and not via reading
    // React `phase` state, which wouldn't reflect this tick's own result
    // until after a re-render) so the very poll that transitions into
    // 'claimed' immediately schedules its *next* tick at the slower claimed
    // cadence, instead of one extra tick at the pending cadence while
    // waiting for React to catch up.
    let knownPhase: TvAppPhase = phase;

    async function poll(): Promise<void> {
      try {
        const status = await fetchTvPairingStatus(deviceToken as string);
        if (cancelled) {
          return;
        }
        if (status.status === 'pending') {
          knownPhase = 'pairing';
          setPhase('pairing');
        } else if (status.status === 'claimed') {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, deviceToken as string);
          }
          const nextManifest = await fetchTvRotationManifest(deviceToken as string);
          if (!cancelled) {
            knownPhase = 'claimed';
            setManifest(nextManifest);
            setPhase('claimed');
          }
        } else {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(STORAGE_KEY);
          }
          if (!cancelled) {
            setDeviceToken(null);
            setManifest(null);
            setPhase('loading');
            setResetCounter((current) => current + 1);
          }
          return;
        }
      } catch {
        // A transient network error just leaves the current phase/manifest
        // as-is until the next poll tick — the same "don't fail the whole
        // screen over one flaky request" posture the rotation screen's own
        // board-frame fetch takes.
      }
      if (!cancelled) {
        timer = setTimeout(poll, knownPhase === 'claimed' ? CLAIMED_POLL_INTERVAL_MS : PENDING_POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [deviceToken]);

  if (phase === 'claimed' && manifest && deviceToken) {
    return <TvRotationScreen deviceToken={deviceToken} manifest={manifest} />;
  }

  if (phase === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
        <p className="text-2xl text-muted-foreground">{t('pairingError')}</p>
      </main>
    );
  }

  if (phase === 'pairing' && code) {
    return <TvPairingScreen code={code} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
      <p className="text-xl text-muted-foreground">{t('loading')}</p>
    </main>
  );
}
