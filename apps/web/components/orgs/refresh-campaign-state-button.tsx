'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface RefreshCampaignStateButtonProps {
  orgId: string;
  projectId: string;
  targetId: string;
}

/** Triggers the read seam (`POST .../targets/[targetId]/refresh`) — a pure observation of the ad platform's own current state, so unlike every manage button on this page it needs no propose→approve cycle. */
export function RefreshCampaignStateButton({ orgId, projectId, targetId }: RefreshCampaignStateButtonProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/automation/targets/${encodeURIComponent(targetId)}/refresh`,
        { method: 'POST' },
      );
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
        {submitting ? t('refreshStateInProgress') : t('refreshStateButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('refreshStateError')}
        </p>
      ) : null}
    </div>
  );
}
