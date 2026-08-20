'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DeleteSegmentButtonProps {
  orgId: string;
  projectId: string;
  segmentId: string;
}

/** Inline per-row delete action on the segments list (unlike goals/boards, a segment has no detail page to redirect away from — `router.refresh()` re-fetches the list in place instead). */
export function DeleteSegmentButton({ orgId, projectId, segmentId }: DeleteSegmentButtonProps): React.ReactElement {
  const t = useTranslations('Segments');
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
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(t('deleteError'));
        return;
      }
      router.refresh();
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
      <Button type="button" variant="destructive" size="sm" disabled={submitting} onClick={handleDelete}>
        {t('deleteButton')}
      </Button>
    </div>
  );
}
