'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface AutomationActivateCampaignButtonProps {
  orgId: string;
  projectId: string;
  targetId: string;
}

/** Proposes a KAN-72 `campaign_activation` action for a target whose campaign is currently paused — lands in the action queue below for approval like any other action. */
export function AutomationActivateCampaignButton({ orgId, projectId, targetId }: AutomationActivateCampaignButtonProps): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-activations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      });
      if (!response.ok) {
        setError(t('proposeActivateError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={handleClick}>
        {t('proposeActivateButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
