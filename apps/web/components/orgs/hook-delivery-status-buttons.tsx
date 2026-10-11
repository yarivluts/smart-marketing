'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface HookDeliveryStatusButtonsProps {
  orgId: string;
  projectId: string;
  hookDeliveryId: string;
}

/** Marks a review-queue delivery `reviewed` or `discarded` (KAN-53) — bookkeeping only, since KAN-54's mapping engine doesn't exist yet to consume these deliveries automatically. */
export function HookDeliveryStatusButtons({ orgId, projectId, hookDeliveryId }: HookDeliveryStatusButtonsProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function setStatus(status: 'reviewed' | 'discarded'): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hook-deliveries/${hookDeliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => setStatus('reviewed')}>
          {t('markReviewed')}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setStatus('discarded')}>
          {t('discardDelivery')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('deliveryStatusError')}
        </p>
      ) : null}
    </div>
  );
}
