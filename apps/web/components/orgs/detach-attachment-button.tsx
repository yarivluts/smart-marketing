'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DetachAttachmentButtonProps {
  orgId: string;
  attachmentId: string;
}

export function DetachAttachmentButton({ orgId, attachmentId }: DetachAttachmentButtonProps): React.ReactElement {
  const t = useTranslations('ProjectResources');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resource-attachments/${attachmentId}`, { method: 'DELETE' });
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
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('detach')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('detachError')}
        </p>
      ) : null}
    </div>
  );
}
