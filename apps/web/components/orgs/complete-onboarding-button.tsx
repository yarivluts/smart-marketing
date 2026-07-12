'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface CompleteOnboardingButtonProps {
  orgId: string;
  projectId: string;
}

/** The wizard's final "done" action (plan `10 §2.6` step 5: invite team / set a goal / turn on the war room — each already actionable via the links this step renders alongside this button). */
export function CompleteOnboardingButton({ orgId, projectId }: CompleteOnboardingButtonProps): React.ReactElement {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/onboarding/complete`, { method: 'POST' });
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
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('genericError')}
        </p>
      ) : null}
      <Button type="button" onClick={handleClick} disabled={submitting}>
        {t('finishButton')}
      </Button>
    </div>
  );
}
