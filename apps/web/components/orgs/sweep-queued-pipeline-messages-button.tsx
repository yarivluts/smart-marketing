'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Brush } from 'lucide-react';
import { PpButton } from '@/components/pastel/primitives';

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
      <PpButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={submitting}
        icon={Brush}
      >
        {t('sweepQueuedMessages')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {t('sweepQueuedMessagesError')}
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-pp-on-surface-variant font-medium">
          {t('sweepQueuedMessagesResult', { delivered: result.delivered, failed: result.failed })}
        </p>
      ) : null}
    </div>
  );
}
