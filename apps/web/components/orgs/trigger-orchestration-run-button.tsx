'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Play } from 'lucide-react';
import { PpButton } from '@/components/pastel/primitives';

export interface TriggerOrchestrationRunButtonProps {
  orgId: string;
  projectId: string;
}

/** Manually triggers one orchestration run for a project right now (KAN-38) from the ingest-health page's orchestration section. */
export function TriggerOrchestrationRunButton({ orgId, projectId }: TriggerOrchestrationRunButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ingest-health/trigger-orchestration-run`, {
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
      <PpButton
        type="button"
        variant="primary"
        size="sm"
        onClick={handleClick}
        disabled={submitting}
        icon={Play}
      >
        {t('orchestrationTriggerButton')}
      </PpButton>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {t('orchestrationTriggerError')}
        </p>
      ) : null}
    </div>
  );
}
