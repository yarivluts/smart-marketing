'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface CheckQualityMixAlertsButtonProps {
  orgId: string;
  projectId: string;
}

/** Manually checks every marketing channel's signup-quality mix for a project right now (KAN-83) from the Intent & Quality page — mirrors `CheckTrackingAlertsButton` (KAN-36). */
export function CheckQualityMixAlertsButton({ orgId, projectId }: CheckQualityMixAlertsButtonProps): React.ReactElement {
  const t = useTranslations('IntentQuality');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/quality-score/check-mix-alerts`, {
        method: 'POST',
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
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('mixAlertCheckButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('mixAlertCheckError')}
        </p>
      ) : null}
    </div>
  );
}
