'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { registerServiceWorker } from '@/lib/push/client';
import { captureInstallPrompt } from '@/lib/push/install-prompt';
import { PushVisitPrompt } from './push-visit-prompt';

/**
 * App-wide installable-app and push wiring: registers the service worker, keeps the browser's
 * install offer for the "Install app" button, and shows the visit prompt to a signed-in person.
 */
export function PwaBootstrap(): React.ReactElement {
  const { user, loading } = useAuth();

  useEffect(() => {
    void registerServiceWorker();
    return captureInstallPrompt();
  }, []);

  return <PushVisitPrompt signedIn={!loading && Boolean(user)} />;
}
