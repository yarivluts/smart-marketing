'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface ArchiveProjectButtonProps {
  orgId: string;
  projectId: string;
  archived: boolean;
}

/** Archives (or unarchives) a project via `POST .../projects/[projectId]/archive` — confirms before archiving, since the project vanishes from the switcher; unarchiving needs no confirmation. */
export function ArchiveProjectButton({ orgId, projectId, archived }: ArchiveProjectButtonProps): React.ReactElement {
  const t = useTranslations('ProjectSettings');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    if (!archived && !window.confirm(t('archiveConfirm'))) {
      return;
    }
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
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
      <Button type="button" variant={archived ? 'outline' : 'destructive'} size="sm" onClick={handleClick} disabled={submitting}>
        {archived ? t('unarchiveButton') : t('archiveButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('archiveError')}
        </p>
      ) : null}
    </div>
  );
}
