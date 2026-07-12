'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OnboardingSourceConnectionMethod } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface OnboardingSourceContinueButtonProps {
  orgId: string;
  projectId: string;
  method: OnboardingSourceConnectionMethod;
  pluginId?: string;
}

/** Advances the wizard's "connect a first source" step, once a real connection has been detected server-side (a source plugin install, or an `ingest.write` key) — see the onboarding page's own doc comment for how `method`/`pluginId` are derived. */
export function OnboardingSourceContinueButton({ orgId, projectId, method, pluginId }: OnboardingSourceContinueButtonProps): React.ReactElement {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/onboarding/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, ...(pluginId ? { pluginId } : {}) }),
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
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('genericError')}
        </p>
      ) : null}
      <Button type="button" onClick={handleClick} disabled={submitting}>
        {t('sourceContinueButton')}
      </Button>
    </div>
  );
}
