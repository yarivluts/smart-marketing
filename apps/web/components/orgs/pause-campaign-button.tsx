'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface PauseCampaignButtonProps {
  orgId: string;
  projectId: string;
  /** The EXECUTED `campaign_activation` action to roll back — pausing IS that rollback (`rollbackCampaignActivation` sets `campaign_status='paused'` on all three executors); no separate pause mutation path exists, deliberately, so pause rides the same audited action lifecycle as everything else. */
  activationActionId: string;
}

export function PauseCampaignButton({ orgId, projectId, activationActionId }: PauseCampaignButtonProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/${activationActionId}/rollback`, {
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
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('pauseButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('pauseError')}
        </p>
      ) : null}
    </div>
  );
}
