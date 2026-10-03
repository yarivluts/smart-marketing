'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Trash2 } from 'lucide-react';
import { PpButton } from '@/components/pastel/primitives';

export interface RevokeApiKeyButtonProps {
  orgId: string;
  projectId: string;
  apiKeyId: string;
}

export function RevokeApiKeyButton({ orgId, projectId, apiKeyId }: RevokeApiKeyButtonProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/keys/${apiKeyId}`, { method: 'DELETE' });
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
      <PpButton
        type="button"
        variant="danger"
        size="sm"
        onClick={handleClick}
        disabled={submitting}
        icon={Trash2}
      >
        {t('revoke')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {t('revokeError')}
        </p>
      ) : null}
    </div>
  );
}
