'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';

export interface EnableHookEndpointButtonProps {
  orgId: string;
  projectId: string;
  hookEndpointId: string;
}

export function EnableHookEndpointButton({ orgId, projectId, hookEndpointId }: EnableHookEndpointButtonProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hook-endpoints/${hookEndpointId}/enable`, {
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
      <PpButton type="button" variant="secondary" size="sm" onClick={handleClick} disabled={submitting}>
        {t('enableEndpoint')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {t('enableEndpointError')}
        </p>
      ) : null}
    </div>
  );
}
