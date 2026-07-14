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

  async function handleClick(): Promise<void> {
    setSubmitting(true);
    try {
      await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-activations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={handleClick}>
      {t('proposeActivateButton')}
    </Button>
  );
}
