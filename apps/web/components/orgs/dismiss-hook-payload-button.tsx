'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DismissHookPayloadButtonProps {
  orgId: string;
  projectId: string;
  hookPayloadId: string;
}

/** Dismisses one review-queue payload (KAN-53) from the hooks admin page's review queue. */
export function DismissHookPayloadButton({ orgId, projectId, hookPayloadId }: DismissHookPayloadButtonProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hook-payloads/${hookPayloadId}/dismiss`, {
        method: 'POST',
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
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('dismissButtonLabel')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('dismissError')}
        </p>
      ) : null}
    </div>
  );
}
