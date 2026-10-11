'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface RetryFailedPipelineMessagesButtonProps {
  orgId: string;
  projectId: string;
}

interface RetryResponse {
  delivered: number;
  failed: number;
}

/** Retries every currently-failed pipeline message for a project (KAN-34's pipeline DLQ replay). */
export function RetryFailedPipelineMessagesButton({
  orgId,
  projectId,
}: RetryFailedPipelineMessagesButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<RetryResponse | null>(null);

  async function handleClick(): Promise<void> {
    setError(false);
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ingest-health/replay-failed-pipeline-messages`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as RetryResponse;
      setResult(body);
      if (body.delivered > 0) {
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('retryFailedDeliveries')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('retryFailedDeliveriesError')}
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-muted-foreground">
          {t('retryFailedDeliveriesResult', { delivered: result.delivered, failed: result.failed })}
        </p>
      ) : null}
    </div>
  );
}
