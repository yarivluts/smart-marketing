'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface ReexportRawRecordsButtonProps {
  orgId: string;
  projectId: string;
}

interface ReexportResponse {
  attempted: number;
  exported: number;
  failed: number;
}

/** Backfills the project's landed raw records into the warehouse (`POST .../ingest-health/reexport-raw-records`) — for records accepted before the warehouse export existed; idempotent for the ones that already reached it. */
export function ReexportRawRecordsButton({ orgId, projectId }: ReexportRawRecordsButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReexportResponse | null>(null);

  async function handleClick(): Promise<void> {
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ingest-health/reexport-raw-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.status === 409) {
        setError(t('reexportNotConfigured'));
        return;
      }
      if (!response.ok) {
        setError(t('reexportError'));
        return;
      }
      setResult((await response.json()) as ReexportResponse);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('reexportRawRecords')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-muted-foreground">
          {t('reexportResult', { attempted: result.attempted, exported: result.exported, failed: result.failed })}
        </p>
      ) : null}
    </div>
  );
}
