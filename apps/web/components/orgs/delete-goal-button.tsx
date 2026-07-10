'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DeleteGoalButtonProps {
  orgId: string;
  projectId: string;
  goalId: string;
}

export function DeleteGoalButton({ orgId, projectId, goalId }: DeleteGoalButtonProps): React.ReactElement {
  const t = useTranslations('Goals');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('deleteConfirm'))) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(t('deleteError'));
        return;
      }
      router.push(`/orgs/${orgId}/projects/${projectId}/goals`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="destructive" disabled={submitting} onClick={handleDelete}>
        {t('deleteButton')}
      </Button>
    </div>
  );
}
