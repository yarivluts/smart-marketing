'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Bell, BellOff, Download, Monitor, Send, Share, SlidersHorizontal, Smartphone } from 'lucide-react';
import { PUSH_CATEGORIES, type PushCategory, type PushPreferences } from '@growthos/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { ChartCard } from '@/components/viz/chart-card';
import {
  currentSubscription,
  deviceFlags,
  fetchPushConfig,
  isPushSupported,
  needsIosInstallForPush,
  notificationPermission,
  isIos,
  isStandalone,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type PushPermission,
  type PushPublicConfig,
} from '@/lib/push/client';
import { promptInstall, useInstallPrompt } from '@/lib/push/install-prompt';

interface DeviceView {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

interface BrowserState {
  supported: boolean;
  permission: PushPermission | 'unsupported';
  subscribed: boolean;
  ios: boolean;
  iosNeedsInstall: boolean;
  standalone: boolean;
}

const INITIAL_BROWSER: BrowserState = { supported: false, permission: 'unsupported', subscribed: false, ios: false, iosNeedsInstall: false, standalone: false };

async function readBrowserState(): Promise<{ state: BrowserState; endpoint: string | null }> {
  const supported = isPushSupported();
  const subscription = supported ? await currentSubscription().catch(() => null) : null;
  return {
    state: {
      supported,
      permission: notificationPermission(),
      subscribed: Boolean(subscription) && !deviceFlags.isOff(),
      ios: isIos(),
      iosNeedsInstall: needsIosInstallForPush(),
      standalone: isStandalone(),
    },
    endpoint: subscription?.endpoint ?? null,
  };
}

/**
 * "Notifications & app": this device's permission and subscription, the person's choices (a master
 * switch and one per category, enforced by the sender), every device that gets notifications, a
 * test, and installing the app (the browser's install button, or the iPhone steps).
 */
export function NotificationSettings(): React.ReactElement {
  const t = useTranslations('PushNotifications');
  const format = useFormatter();
  const locale = useLocale();
  const install = useInstallPrompt();
  const [config, setConfig] = useState<PushPublicConfig | null>(null);
  const [browser, setBrowser] = useState<BrowserState>(INITIAL_BROWSER);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [loadedConfig, { state, endpoint }] = await Promise.all([fetchPushConfig(), readBrowserState()]);
    setConfig(loadedConfig);
    setBrowser(state);
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
    const [preferencesResponse, devicesResponse] = await Promise.all([
      fetch('/api/push/preferences', { cache: 'no-store' }).catch(() => null),
      fetch(`/api/push/subscriptions${query}`, { cache: 'no-store' }).catch(() => null),
    ]);
    if (preferencesResponse?.ok) setPreferences(((await preferencesResponse.json()) as { preferences: PushPreferences }).preferences);
    if (devicesResponse?.ok) setDevices(((await devicesResponse.json()) as { devices: DeviceView[] }).devices);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const configured = config?.configured === true && Boolean(config.publicKey);

  async function enableHere(): Promise<void> {
    if (!config?.publicKey) return;
    setBusy('enable');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({ description: t('prompt.blocked'), variant: 'destructive' });
        return;
      }
      const subscription = await subscribeThisDevice(config.publicKey, locale);
      toast(subscription ? { description: t('status.enabledToast'), variant: 'success' } : { description: t('status.failedToast'), variant: 'destructive' });
    } catch {
      toast({ description: t('status.failedToast'), variant: 'destructive' });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function disableHere(): Promise<void> {
    setBusy('disable');
    try {
      await unsubscribeThisDevice();
      toast({ description: t('status.disabledToast'), variant: 'success' });
    } catch {
      toast({ description: t('status.failedToast'), variant: 'destructive' });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function savePreferences(change: { enabled?: boolean; categories?: Partial<Record<PushCategory, boolean>> }): Promise<void> {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ enabled: change.enabled ?? previous.enabled, categories: { ...previous.categories, ...change.categories } });
    const response = await fetch('/api/push/preferences', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(change) }).catch(() => null);
    if (response?.ok) {
      setPreferences(((await response.json()) as { preferences: PushPreferences }).preferences);
    } else {
      setPreferences(previous);
      toast({ description: t('preferences.failed'), variant: 'destructive' });
    }
  }

  async function removeDevice(device: DeviceView): Promise<void> {
    setBusy(`remove:${device.id}`);
    try {
      if (device.current) {
        await unsubscribeThisDevice();
      } else {
        const response = await fetch(`/api/push/subscriptions/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(String(response.status));
      }
      toast({ description: t('devices.removed'), variant: 'success' });
    } catch {
      toast({ description: t('devices.removeFailed'), variant: 'destructive' });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function sendTest(): Promise<void> {
    setBusy('test');
    try {
      const response = await fetch('/api/push/test', { method: 'POST' });
      if (response.ok) toast({ description: t('test.sent'), variant: 'success' });
      else if (response.status === 409) toast({ description: t('test.noDevices'), variant: 'warning' });
      else toast({ description: t('test.failed'), variant: 'destructive' });
    } catch {
      toast({ description: t('test.failed'), variant: 'destructive' });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function installApp(): Promise<void> {
    setBusy('install');
    try {
      await promptInstall();
    } finally {
      setBusy(null);
      setBrowser((state) => ({ ...state, standalone: isStandalone() }));
    }
  }

  function formatDate(value: string): string {
    return format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  }

  const permissionTone = browser.permission === 'granted' ? 'success' : browser.permission === 'denied' ? 'destructive' : 'secondary';
  const canEnableHere = configured && browser.supported && browser.permission !== 'denied' && !browser.subscribed;

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="notification-settings">
      <ChartCard title={t('status.title')} description={t('status.description')} icon={browser.subscribed ? Bell : BellOff}>
        {config && !configured ? (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="push-not-configured">
            {t('status.notConfigured')}
          </p>
        ) : null}
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-muted-foreground">{t('status.permissionLabel')}</dt>
            <dd>
              <Badge variant={permissionTone} data-testid="push-permission">
                {t(`status.permission.${browser.permission}`)}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-muted-foreground">{t('status.deviceLabel')}</dt>
            <dd className="font-medium text-foreground" data-testid="push-device-state">
              {browser.subscribed ? t('status.deviceOn') : t('status.deviceOff')}
            </dd>
          </div>
        </dl>
        {!browser.supported && !browser.iosNeedsInstall ? <p className="mt-3 text-sm text-muted-foreground">{t('status.unsupported')}</p> : null}
        {browser.iosNeedsInstall ? (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="push-ios-note">
            {t('install.iosPushNote')}
          </p>
        ) : null}
        {browser.permission === 'denied' ? (
          <p className="mt-3 rounded-lg bg-destructive/5 px-3 py-2 text-sm text-foreground" data-testid="push-denied-help">
            {t('status.deniedHelp')}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {canEnableHere ? (
            <Button onClick={() => void enableHere()} isLoading={busy === 'enable'} disabled={busy !== null} leftIcon={<Bell className="h-4 w-4" aria-hidden="true" />}>
              {t('status.enableButton')}
            </Button>
          ) : null}
          {browser.subscribed ? (
            <Button variant="outline" onClick={() => void disableHere()} isLoading={busy === 'disable'} disabled={busy !== null} leftIcon={<BellOff className="h-4 w-4" aria-hidden="true" />}>
              {t('status.disableButton')}
            </Button>
          ) : null}
          {configured ? (
            <Button
              variant="secondary"
              onClick={() => void sendTest()}
              isLoading={busy === 'test'}
              disabled={busy !== null || !devices || devices.length === 0}
              leftIcon={<Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />}
            >
              {t('test.button')}
            </Button>
          ) : null}
        </div>
      </ChartCard>

      <ChartCard title={t('install.title')} description={t('install.description')} icon={Download}>
        {browser.standalone || install.installed ? (
          <p className="text-sm text-foreground" data-testid="pwa-installed">
            {t('install.installed')}
          </p>
        ) : install.canInstall ? (
          <Button onClick={() => void installApp()} isLoading={busy === 'install'} disabled={busy !== null} leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}>
            {t('install.button')}
          </Button>
        ) : browser.ios ? (
          <div className="flex flex-col gap-2 text-sm text-foreground" data-testid="pwa-ios-steps">
            <p className="flex items-start gap-2">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t('install.iosSteps')}</span>
            </p>
            <p className="text-muted-foreground">{t('install.iosPushNote')}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('install.unavailable')}</p>
        )}
      </ChartCard>

      <ChartCard title={t('preferences.title')} description={t('preferences.description')} icon={SlidersHorizontal}>
        {preferences ? (
          <ul className="flex flex-col gap-2">
            <li className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p id="push-pref-master" className="font-medium text-foreground">
                  {t('preferences.master')}
                </p>
                <p className="text-xs text-muted-foreground">{t('preferences.masterHint')}</p>
              </div>
              <Switch aria-labelledby="push-pref-master" checked={preferences.enabled} onCheckedChange={(checked) => void savePreferences({ enabled: checked })} />
            </li>
            {PUSH_CATEGORIES.map((category) => (
              <li key={category} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p id={`push-pref-${category}`} className="font-medium text-foreground">
                    {t(`preferences.categories.${category}.label`)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(`preferences.categories.${category}.hint`)}</p>
                </div>
                <Switch
                  aria-labelledby={`push-pref-${category}`}
                  checked={preferences.categories[category]}
                  disabled={!preferences.enabled}
                  onCheckedChange={(checked) => void savePreferences({ categories: { [category]: checked } })}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </ChartCard>

      <ChartCard title={t('devices.title')} description={t('devices.description')} icon={Smartphone}>
        {devices && devices.length === 0 ? <p className="text-sm text-muted-foreground">{t('devices.empty')}</p> : null}
        {devices && devices.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="push-devices">
            {devices.map((device) => {
              const name = device.label || t('devices.unnamed');
              return (
                <li key={device.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <span className="truncate" dir="ltr">
                          {name}
                        </span>
                        {device.current ? <Badge variant="secondary">{t('devices.current')}</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('devices.added', { date: formatDate(device.createdAt) })}
                        {device.lastUsedAt ? ` · ${t('devices.lastUsed', { date: formatDate(device.lastUsedAt) })}` : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('devices.removeLabel', { device: name })}
                    onClick={() => void removeDevice(device)}
                    isLoading={busy === `remove:${device.id}`}
                    disabled={busy !== null}
                  >
                    {t('devices.remove')}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </ChartCard>
    </div>
  );
}
