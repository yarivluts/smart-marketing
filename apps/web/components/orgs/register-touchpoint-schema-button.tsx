'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';
import { Sparkles } from 'lucide-react';

export interface RegisterTouchpointSchemaButtonProps {
  orgId: string;
  projectId: string;
}

/** One-click "set up touchpoint capture" action on the Schema Registry page (KAN-57). */
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
      <PpButton type="button" variant="primary" size="sm" icon={Sparkles} onClick={handleClick} disabled={submitting}>
        {t('touchpointSchemaSetupButton')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error">
          {t('touchpointSchemaSetupError')}
        </p>
      ) : null}
    </div>
  );
}
