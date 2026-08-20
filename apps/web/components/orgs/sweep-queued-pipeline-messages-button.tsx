'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface SweepQueuedPipelineMessagesButtonProps {
  orgId: string;
  projectId: string;
}

interface SweepResponse {
  delivered: number;
  failed: number;
}

/** Lands every pipeline message still stuck `queued` for a project (e.g. a crash between publish and land). */
export function SweepQueuedPipelineMessagesButton({
  orgId,
  projectId,
}: SweepQueuedPipelineMessagesButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<SweepResponse | null>(null);

  async function handleClick(): Promise<void> {
    setError(false);
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ingest-health/sweep-queued-pipeline-messages`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as SweepResponse;
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
        {t('sweepQueuedMessages')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('sweepQueuedMessagesError')}
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-muted-foreground">{t('sweepQueuedMessagesResult', { delivered: result.delivered, failed: result.failed })}</p>
      ) : null}
    </div>
  );
}
