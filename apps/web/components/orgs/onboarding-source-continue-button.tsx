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
  /** Whether any event has actually been accepted for this project — see below. */
  hasReceivedData?: boolean;
}

/**
 * Advances the wizard's "connect a first source" step.
 *
 * The step is reachable once a source plugin is installed or an `ingest.write` key exists,
 * but neither of those means data is flowing: minting a key moves nothing on its own. So the
 * label distinguishes the two — continuing with no events received is a legitimate choice
 * (you may be wiring the snippet up later), it just should not read as though the connection
 * is finished. See the onboarding page for how `method`/`pluginId` are derived.
 */
export function OnboardingSourceContinueButton({
  orgId,
  projectId,
  method,
  pluginId,
  hasReceivedData = false,
}: OnboardingSourceContinueButtonProps): React.ReactElement {
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
        {hasReceivedData ? t('sourceContinueButton') : t('sourceContinueWithoutDataButton')}
      </Button>
    </div>
  );
}
