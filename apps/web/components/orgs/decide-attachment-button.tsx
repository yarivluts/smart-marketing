'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DecideAttachmentButtonProps {
  orgId: string;
  attachmentId: string;
  approve: boolean;
}

export function DecideAttachmentButton({ orgId, attachmentId, approve }: DecideAttachmentButtonProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resource-attachments/${attachmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
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
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={approve ? 'default' : 'outline'}
        size="sm"
        onClick={handleClick}
        disabled={submitting}
      >
        {approve ? t('approve') : t('reject')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('decideError')}
        </p>
      ) : null}
    </div>
  );
}
