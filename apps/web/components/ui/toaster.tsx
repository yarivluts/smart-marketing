'use client';

import * as React from 'react';
import { useToast } from './use-toast';
import { Toast } from './toast';

export interface ToasterProps {
  /** Translated screen-reader names; English when omitted. */
  labels?: { region: string; dismiss: string };
}

export function Toaster({ labels }: ToasterProps = {}): React.ReactElement | null {
  const { toasts, dismiss } = useToast();

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-label={labels?.region ?? 'Notifications'}
      className="pointer-events-none fixed bottom-4 end-4 z-50 flex max-h-screen w-full max-w-sm flex-col gap-2 p-4 outline-none sm:max-w-md"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} dismissLabel={labels?.dismiss} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
