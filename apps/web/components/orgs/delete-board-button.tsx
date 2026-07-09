'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DeleteBoardButtonProps {
  orgId: string;
  projectId: string;
  boardId: string;
}

export function DeleteBoardButton({ orgId, projectId, boardId }: DeleteBoardButtonProps): React.ReactElement {
  const t = useTranslations('Boards');
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
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/boards/${boardId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(t('deleteError'));
        return;
      }
      router.push(`/orgs/${orgId}/projects/${projectId}/boards`);
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
