'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ackTvPairingCommand,
  fetchTvPairingStatus,
  fetchTvRotationManifest,
  requestTvPairing,
  type TvCecSchedule,
  type TvPowerState,
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

function isWithinCecSleepSchedule(schedule: TvCecSchedule): boolean {
  if (!schedule.enabled || !schedule.sleepTime || !schedule.wakeTime) {
    return false;
  }
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = schedule.sleepTime.split(':').map(Number);
  const [wh, wm] = schedule.wakeTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(wh) || Number.isNaN(wm)) {
    return false;
  }
  const sleepMinutes = sh * 60 + sm;
  const wakeMinutes = wh * 60 + wm;
  if (sleepMinutes <= wakeMinutes) {
    return currentMinutes >= sleepMinutes && currentMinutes < wakeMinutes;
  }
  return currentMinutes >= sleepMinutes || currentMinutes < wakeMinutes;
}

/**
 * The war-room TV's full client-side state machine (KAN-67, E12.3): mint (or
 * resume) a pairing, show the code and poll until an admin claims it, then
 * hand off to the fullscreen rotation. Deliberately owns every long-lived
 * timer itself (rather than delegating to child effects) so there is exactly
 * one poll loop running at any moment — the `useEffect` cleanup on every
 * transition (`deviceToken` change, unmount) is what keeps this AC's "no
 * leak over 24h" promise: no interval or `EventSource` ever outlives the
 * phase it was created for.
 * Extended in KAN-307 with remote display power management, CEC standby, and command dispatch.
 */
export function TvApp(): React.ReactElement {
  const t = useTranslations('TvMode');
  const [phase, setPhase] = useState<TvAppPhase>('loading');
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [manifest, setManifest] = useState<TvRotationManifest | null>(null);
  const [resetCounter, setResetCounter] = useState(0);
  const [powerState, setPowerState] = useState<TvPowerState>('on');

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

          // Check remote command queue (KAN-307)
          if (status.pendingCommand) {
            const cmd = status.pendingCommand;
            if (cmd.type === 'force_reload') {
              try {
                await ackTvPairingCommand(deviceToken as string, {
                  commandId: cmd.commandId,
                  status: 'acknowledged',
                });
              } catch {
                // best effort ack before reload
              }
              window.location.reload();
              return;
            }
            if (cmd.type === 'reboot') {
              try {
                await ackTvPairingCommand(deviceToken as string, {
                  commandId: cmd.commandId,
                  status: 'acknowledged',
                });
              } catch {
                // best effort
              }
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem(STORAGE_KEY);
              }
              setDeviceToken(null);
              setManifest(null);
              setPhase('loading');
              setResetCounter((current) => current + 1);
              return;
            }
            if (cmd.type === 'display_sleep') {
              setPowerState('sleep');
              void ackTvPairingCommand(deviceToken as string, {
                commandId: cmd.commandId,
                status: 'acknowledged',
                powerState: 'sleep',
              });
            } else if (cmd.type === 'display_wake') {
              setPowerState('on');
              void ackTvPairingCommand(deviceToken as string, {
                commandId: cmd.commandId,
                status: 'acknowledged',
                powerState: 'on',
              });
            }
          } else if (status.powerState) {
            setPowerState(status.powerState);
          }

          // Check automated CEC standby schedule
          if (status.cecSchedule?.enabled && isWithinCecSleepSchedule(status.cecSchedule)) {
            setPowerState((current) => (current === 'on' ? 'standby' : current));
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
        // Transient network error
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

  function handleWakeDisplay(): void {
    setPowerState('on');
    if (deviceToken) {
      void ackTvPairingCommand(deviceToken, {
        commandId: `local-wake-${Date.now()}`,
        status: 'acknowledged',
        powerState: 'on',
      });
    }
  }

  if (phase === 'claimed' && manifest && deviceToken) {
    return (
      <div className="relative w-full h-full">
        {(powerState === 'sleep' || powerState === 'standby') && (
          <div
            role="region"
            aria-label="Display Standby Mode"
            tabIndex={0}
            onClick={handleWakeDisplay}
            onKeyDown={handleWakeDisplay}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-zinc-500 font-mono select-none cursor-pointer outline-none"
          >
            <div className="w-3 h-3 rounded-full bg-emerald-700 animate-ping mb-4" />
            <p className="text-sm font-semibold tracking-widest uppercase text-zinc-400">
              {powerState === 'sleep' ? t('displaySleep') : t('cecStandby')}
            </p>
            <p className="text-xs text-zinc-600 mt-2">{t('pressAnyKeyToWake')}</p>
          </div>
        )}
        <TvRotationScreen deviceToken={deviceToken} manifest={manifest} />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-pp-surface p-8 text-center font-pp-body">
        <p className="text-2xl text-pp-error font-medium">{t('pairingError')}</p>
      </main>
    );
  }

  if (phase === 'pairing' && code) {
    return <TvPairingScreen code={code} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-pp-surface p-8 text-center font-pp-body">
      <p className="text-xl text-pp-outline font-mono animate-pulse">{t('loading')}</p>
    </main>
  );
}
