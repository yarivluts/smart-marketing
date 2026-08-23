'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface CheckFirmographicCompositionAlertsButtonProps {
  orgId: string;
  projectId: string;
}

/** Manually checks every industry's customer-base composition-shift status for a project right now (KAN-87) from the Firmographics page's alerts section. */
export function CheckFirmographicCompositionAlertsButton({ orgId, projectId }: CheckFirmographicCompositionAlertsButtonProps): React.ReactElement {
  const t = useTranslations('Firmographics');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/firmographics/check-composition-alerts`, {
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
        {t('compositionAlertCheckButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('compositionAlertCheckError')}
        </p>
      ) : null}
    </div>
  );
}
