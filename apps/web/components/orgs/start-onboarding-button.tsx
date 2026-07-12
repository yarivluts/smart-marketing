'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface StartOnboardingButtonProps {
  orgId: string;
  projectId: string;
}

/** Starts a project's onboarding wizard (KAN-68) — shown once, before the wizard's singleton state doc exists. */
export function StartOnboardingButton({ orgId, projectId }: StartOnboardingButtonProps): React.ReactElement {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/onboarding`, { method: 'POST' });
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
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">{t('introBody')}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('genericError')}
        </p>
      ) : null}
      <Button type="button" onClick={handleClick} disabled={submitting}>
        {t('startButton')}
      </Button>
    </div>
  );
}
