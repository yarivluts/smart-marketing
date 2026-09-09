'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface GoalStatusButtonProps {
  orgId: string;
  projectId: string;
  goalId: string;
  /** The goal's current status — the button offers the opposite transition. */
  status: 'active' | 'paused';
}

/** Pauses or resumes a goal via `POST .../goals/[goalId]/status` — the in-between a goal never had before (delete forever, or keep reporting off-track). */
export function GoalStatusButton({ orgId, projectId, goalId, status }: GoalStatusButtonProps): React.ReactElement {
  const t = useTranslations('Goals');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const nextStatus = status === 'paused' ? 'active' : 'paused';

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
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
        {status === 'paused' ? t('resumeButton') : t('pauseButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('statusUpdateError')}
        </p>
      ) : null}
    </div>
  );
}
