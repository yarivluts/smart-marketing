'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface ReplayQuarantinedRecordButtonProps {
  orgId: string;
  projectId: string;
  quarantinedRecordId: string;
}

interface ReplayResponse {
  outcome: 'accepted' | 'duplicate' | 'still_quarantined';
  reasons?: string[];
}

/** Replays one quarantined record (KAN-34 AC: "replay after schema fix succeeds") from the ingest-health quarantine browser. */
export function ReplayQuarantinedRecordButton({
  orgId,
  projectId,
  quarantinedRecordId,
}: ReplayQuarantinedRecordButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [outcome, setOutcome] = useState<ReplayResponse | null>(null);

  async function handleClick(): Promise<void> {
    setError(false);
    setOutcome(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/quarantined-records/${quarantinedRecordId}/replay`,
        { method: 'POST' },
      );
      if (!response.ok) {
        setError(true);
        return;
      }
      const result = (await response.json()) as ReplayResponse;
      setOutcome(result);
      if (result.outcome !== 'still_quarantined') {
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('replayButtonLabel')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('replayError')}
        </p>
      ) : null}
      {outcome ? (
        <p className="text-xs text-muted-foreground">
          {outcome.outcome === 'accepted'
            ? t('replayOutcomeAccepted')
            : outcome.outcome === 'duplicate'
              ? t('replayOutcomeDuplicate')
              : t('replayOutcomeStillQuarantined', { reasons: (outcome.reasons ?? []).join(', ') })}
        </p>
      ) : null}
    </div>
  );
}
