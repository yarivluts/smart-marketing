'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface RevokeHookEndpointButtonProps {
  orgId: string;
  projectId: string;
  hookEndpointId: string;
}

export function RevokeHookEndpointButton({ orgId, projectId, hookEndpointId }: RevokeHookEndpointButtonProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hooks/${hookEndpointId}`, { method: 'DELETE' });
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
      <Button type="button" variant="destructive" size="sm" onClick={handleClick} disabled={submitting}>
        {t('revoke')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('revokeError')}
        </p>
      ) : null}
    </div>
  );
}
