'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';

export interface DisableFieldMappingButtonProps {
  orgId: string;
  projectId: string;
  fieldMappingId: string;
}

export function DisableFieldMappingButton({ orgId, projectId, fieldMappingId }: DisableFieldMappingButtonProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings/${fieldMappingId}`, {
        method: 'DELETE',
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
      <PpButton type="button" variant="danger" size="sm" onClick={handleClick} disabled={submitting}>
        {t('disableMapping')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error">
          {t('disableMappingError')}
        </p>
      ) : null}
    </div>
  );
}
