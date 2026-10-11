'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface RegisterTouchpointSchemaButtonProps {
  orgId: string;
  projectId: string;
}

/** One-click "set up touchpoint capture" action on the Schema Registry page (KAN-57) — idempotently registers the `touchpoint` event schema so the tracker/embed snippet's events stop quarantining with `schema_not_registered`. */
export function RegisterTouchpointSchemaButton({ orgId, projectId }: RegisterTouchpointSchemaButtonProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/schema-defs/register-touchpoint`, {
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
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('touchpointSchemaSetupButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('touchpointSchemaSetupError')}
        </p>
      ) : null}
    </div>
  );
}
