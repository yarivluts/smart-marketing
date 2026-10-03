'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';
import { Check, Trash2 } from 'lucide-react';

export interface HookDeliveryStatusButtonsProps {
  orgId: string;
  projectId: string;
  hookDeliveryId: string;
}

/** Marks a review-queue delivery `reviewed` or `discarded` (KAN-53). */
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
        <PpButton type="button" variant="secondary" size="sm" icon={Check} disabled={submitting} onClick={() => setStatus('reviewed')}>
          {t('markReviewed')}
        </PpButton>
        <PpButton type="button" variant="ghost" size="sm" icon={Trash2} disabled={submitting} onClick={() => setStatus('discarded')}>
          {t('discardDelivery')}
        </PpButton>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {t('deliveryStatusError')}
        </p>
      ) : null}
    </div>
  );
}
