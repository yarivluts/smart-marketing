'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BellRing, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  currentSubscription,
  deviceFlags,
  fetchPushConfig,
  isPushSupported,
  needsIosInstallForPush,
  notificationPermission,
  saveSubscriptionOnServer,
  subscribeThisDevice,
} from '@/lib/push/client';

type PromptMode = 'hidden' | 'ask' | 'ios-install';

/**
 * Asked on every visit while the browser has not been asked yet: a soft in-app card (never the
 * browser's own dialog until the person taps "Turn on"). "Not now" hides it for this tab session.
 * When permission is already granted, this device's subscription is quietly restored and re-sent
 * once per session; when it was denied, nothing is shown (the settings page explains how to undo
 * it). On an iPhone outside the installed app, where web push cannot work, it explains how to
 * install instead.
 */
export function PushVisitPrompt({ signedIn }: { signedIn: boolean }): React.ReactElement | null {
  const t = useTranslations('PushNotifications.prompt');
  const locale = useLocale();
  const [mode, setMode] = useState<PromptMode>('hidden');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setMode('hidden');
      return;
    }
    let cancelled = false;
    void (async () => {
      if (deviceFlags.isOff()) return;
      if (!isPushSupported()) {
        if (needsIosInstallForPush() && !deviceFlags.isPromptDismissed()) {
          const config = await fetchPushConfig();
          if (!cancelled && config.configured) setMode('ios-install');
        }
        return;
      }
      const config = await fetchPushConfig();
      if (cancelled || !config.configured || !config.publicKey) return;
      const permission = notificationPermission();
      if (permission === 'default') {
        if (!deviceFlags.isPromptDismissed()) {
          setPublicKey(config.publicKey);
          setMode('ask');
        }
        return;
      }
      if (permission !== 'granted' || deviceFlags.isSynced()) return;
      try {
        // Allowed already: make sure this device is subscribed, and that the server has it for
        // whoever is signed in now. Quiet - nothing to ask, nothing to show.
        const existing = await currentSubscription();
        if (existing) {
          if (await saveSubscriptionOnServer(existing, locale)) deviceFlags.setSynced();
        } else {
          await subscribeThisDevice(config.publicKey, locale);
        }
      } catch {
        // Best-effort; the settings page shows this device's real state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, locale]);

  if (mode === 'hidden') return null;

  function dismiss(): void {
    deviceFlags.dismissPrompt();
    setMode('hidden');
  }

  async function enable(): Promise<void> {
    if (!publicKey) return;
    setBusy(true);
    try {
      // Called straight from the click, as browsers require.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') toast({ description: t('blocked'), variant: 'destructive' });
        else deviceFlags.dismissPrompt();
        setMode('hidden');
        return;
      }
      const subscription = await subscribeThisDevice(publicKey, locale);
      toast(subscription ? { description: t('enabled'), variant: 'success' } : { description: t('failed'), variant: 'destructive' });
      setMode('hidden');
    } catch {
      toast({ description: t('failed'), variant: 'destructive' });
      setMode('hidden');
    } finally {
      setBusy(false);
    }
  }

  const ios = mode === 'ios-install';
  return (
    <section
      role="region"
      aria-label={t('region')}
      data-testid="push-visit-prompt"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-pp bg-pp-surface-container-lowest p-pp-md shadow-pp-candy-hover ring-1 ring-pp-outline-variant/40 sm:inset-x-auto sm:bottom-6 sm:end-6 sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pp-primary-fixed text-pp-on-primary-fixed">
          {ios ? <Share className="h-5 w-5" aria-hidden="true" /> : <BellRing className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-pp-body-lg font-semibold text-pp-on-surface">{ios ? t('iosTitle') : t('title')}</h2>
          <p className="mt-1 text-sm text-pp-on-surface-variant">{ios ? t('iosBody') : t('body')}</p>
          {ios ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void enable()} isLoading={busy} disabled={busy}>
                {t('enable')}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
                {t('notNow')}
              </Button>
            </div>
          )}
        </div>
        {ios ? (
          <button type="button" onClick={dismiss} aria-label={t('notNow')} className="rounded-full p-1 text-pp-on-surface-variant hover:bg-pp-surface-container">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
