'use client';

import { useSyncExternalStore } from 'react';

/**
 * The browser's "install this app" offer (`beforeinstallprompt`, Chrome/Edge/Android). It fires
 * once per page load, often before the settings page is open, so it is captured app-wide by
 * `PwaBootstrap` and kept here until a button uses it.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Starts listening (idempotent); returns a function that stops. */
export function captureInstallPrompt(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onPrompt = (event: Event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    installed = true;
    notify();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Shows the browser's install dialog; true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') {
    installed = true;
    notify();
  }
  return outcome === 'accepted';
}

interface InstallState {
  canInstall: boolean;
  installed: boolean;
}

let snapshot: InstallState = { canInstall: false, installed: false };

function readSnapshot(): InstallState {
  if (snapshot.canInstall !== (deferred !== null) || snapshot.installed !== installed) {
    snapshot = { canInstall: deferred !== null, installed };
  }
  return snapshot;
}

const SERVER_SNAPSHOT: InstallState = { canInstall: false, installed: false };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallPrompt(): InstallState {
  return useSyncExternalStore(subscribe, readSnapshot, () => SERVER_SNAPSHOT);
}

/** For tests. */
export function setDeferredInstallPromptForTest(event: BeforeInstallPromptEvent | null, isInstalled = false): void {
  deferred = event;
  installed = isInstalled;
  notify();
}
