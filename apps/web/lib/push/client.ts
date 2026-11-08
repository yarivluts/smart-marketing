/**
 * Browser-side push and install helpers: feature detection, the service worker, subscribing with
 * the server's public VAPID key, and the per-device "turned off here" flag. No React in here, so
 * the visit prompt and the settings page share one implementation.
 */

export const SERVICE_WORKER_URL = '/sw.js';

/** Set when the person turned notifications off on this device: no silent re-subscribe, no prompt. */
const DEVICE_OFF_KEY = 'growthos.push.deviceOff';
/** Set when the person said "Not now" to the visit prompt: hidden until this tab session ends. */
const PROMPT_DISMISSED_KEY = 'growthos.push.promptDismissed';
/** Set once this tab session re-sent its subscription to the server. */
const SYNCED_KEY = 'growthos.push.synced';

export type PushPermission = 'default' | 'granted' | 'denied';

export interface PushPublicConfig {
  configured: boolean;
  publicKey: string | null;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission(): PushPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushPermission;
}

/** iPhone / iPad Safari (including iPadOS that reports itself as a Mac). */
export function isIos(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints ?? 0): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
}

/** Running as the installed app (from the home screen) rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

/** On iOS, push only works once the site is added to the home screen and opened from there. */
export function needsIosInstallForPush(): boolean {
  return isIos() && !isStandalone();
}

/** A short device name from the user agent, e.g. "Chrome on Android". */
export function deviceLabel(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(userAgent)
        ? 'Firefox'
        : /SamsungBrowser/.test(userAgent)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS/.test(userAgent)
            ? 'Chrome'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : 'Browser';
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPod/.test(userAgent)
      ? 'iPhone'
      : /iPad/.test(userAgent)
        ? 'iPad'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : '';
  return system ? `${browser} · ${system}` : browser;
}

function storageGet(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage: 'local' | 'session', key: string, value: string | null): void {
  try {
    const target = storage === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the prompt simply shows again next time.
  }
}

export const deviceFlags = {
  isOff: (): boolean => storageGet('local', DEVICE_OFF_KEY) === '1',
  setOff: (off: boolean): void => storageSet('local', DEVICE_OFF_KEY, off ? '1' : null),
  isPromptDismissed: (): boolean => storageGet('session', PROMPT_DISMISSED_KEY) === '1',
  dismissPrompt: (): void => storageSet('session', PROMPT_DISMISSED_KEY, '1'),
  isSynced: (): boolean => storageGet('session', SYNCED_KEY) === '1',
  setSynced: (): void => storageSet('session', SYNCED_KEY, '1'),
};

let configPromise: Promise<PushPublicConfig> | null = null;

/** The server's push setup, fetched once per page load. */
export function fetchPushConfig(): Promise<PushPublicConfig> {
  if (!configPromise) {
    configPromise = fetch('/api/push/config', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<PushPublicConfig>) : { configured: false, publicKey: null }))
      .catch(() => {
        configPromise = null;
        return { configured: false, publicKey: null };
      });
  }
  return configPromise;
}

/** For tests: forget the cached config. */
export function resetPushConfigCache(): void {
  configPromise = null;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  } catch {
    return null;
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const registration = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker());
  return registration ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await readyRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** Sends this browser's subscription to the server for the signed-in user. */
export async function saveSubscriptionOnServer(subscription: PushSubscription, locale: string): Promise<boolean> {
  const response = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), deviceLabel: deviceLabel(), locale }),
  });
  return response.ok;
}

/**
 * Subscribes this browser (permission must already be granted) and saves it. Returns the
 * subscription, or null when the browser or the server could not.
 */
export async function subscribeThisDevice(publicKey: string, locale: string): Promise<PushSubscription | null> {
  const registration = await readyRegistration();
  if (!registration) return null;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
  const saved = await saveSubscriptionOnServer(subscription, locale);
  if (!saved) return null;
  deviceFlags.setOff(false);
  deviceFlags.setSynced();
  return subscription;
}

/** Stops push on this browser and tells the server to forget it. */
export async function unsubscribeThisDevice(): Promise<void> {
  deviceFlags.setOff(true);
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}
