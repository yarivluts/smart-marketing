'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface ArchiveMetricDefButtonProps {
  orgId: string;
  projectId: string;
  name: string;
}

/** Retires a metric family via `POST .../metric-defs/archive` — confirms first, since the family disappears from every catalog listing (though never from the record). */
export function ArchiveMetricDefButton({ orgId, projectId, name }: ArchiveMetricDefButtonProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (!window.confirm(t('archiveConfirm', { name }))) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/metric-defs/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.status === 409) {
        const body = (await response.json()) as { referencedBy?: string[] };
        setError(t('archiveStillReferencedError', { referencedBy: (body.referencedBy ?? []).join(', ') }));
        return;
      }
      if (!response.ok) {
        setError(t('archiveError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleClick} disabled={submitting}>
        {t('archive')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
