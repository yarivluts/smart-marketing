'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';
import { Activity } from 'lucide-react';

export interface CheckTrackingAlertsButtonProps {
  orgId: string;
  projectId: string;
}

/** Manually checks every active event schema's volume for a project right now (KAN-36). */
export function CheckTrackingAlertsButton({ orgId, projectId }: CheckTrackingAlertsButtonProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/schema-defs/check-tracking-alerts`, {
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
      <PpButton type="button" variant="secondary" size="sm" icon={Activity} onClick={handleClick} disabled={submitting}>
        {t('trackingAlertCheckButton')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error">
          {t('trackingAlertCheckError')}
        </p>
      ) : null}
    </div>
  );
}
