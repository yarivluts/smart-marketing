'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface EnableFieldMappingButtonProps {
  orgId: string;
  projectId: string;
  fieldMappingId: string;
}

export function EnableFieldMappingButton({ orgId, projectId, fieldMappingId }: EnableFieldMappingButtonProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings/${fieldMappingId}/enable`, {
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
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('enableMapping')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('enableMappingError')}
        </p>
      ) : null}
    </div>
  );
}
